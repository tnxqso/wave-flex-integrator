'use strict';
const mqtt = require('mqtt');

class MqttRotatorClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger || console;
    this.client = null;
    this.remoteStartAzimuth = 0; // Default to 0 until we hear from the rotor
  }

  setConfig(newConfig) {
      this.config = newConfig;
      this.disconnect();
  }

  connect() {
    if (this.client && this.client.connected) return;
    if (!this.config.rotator.enabled) return;

    const mqttConfig = this.config.rotator.mqtt;
    if (!mqttConfig.host) return;

    const brokerUrl = `mqtt://${mqttConfig.host}:${mqttConfig.port}`;
    
    this.logger.info(`Connecting to Rotator MQTT Broker: ${brokerUrl}`);

    this.client = mqtt.connect(brokerUrl, {
        username: mqttConfig.username,
        password: mqttConfig.password,
        reconnectPeriod: 5000
    });

    this.client.on('connect', () => {
        this.logger.info('Connected to Rotator MQTT Broker');
        this.subscribeAndSync();
    });

    this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
    });

    this.client.on('error', (err) => {
        this.logger.error(`MQTT Error: ${err.message}`);
    });
  }

  subscribeAndSync() {
      const prefix = this.config.rotator.mqtt.topicPrefix;
      
      // 1. Subscribe to StartAzimuth so we know the offset
      const startAzTopic = `${prefix}/StartAzimuth`;
      this.client.subscribe(startAzTopic, (err) => {
          if (!err) {
              this.logger.debug(`Subscribed to ${startAzTopic}`);
              
              // 2. Trigger a sync/get command to force rotor to send its config now
              const getTopic = `${prefix}/get`;
              this.client.publish(getTopic, "1"); 
          }
      });
  }

  handleMessage(topic, message) {
      const prefix = this.config.rotator.mqtt.topicPrefix;
      const msgString = message.toString();

      if (topic === `${prefix}/StartAzimuth`) {
          const val = parseInt(msgString);
          if (!isNaN(val)) {
              this.remoteStartAzimuth = val;
              this.logger.info(`Received Rotor StartAzimuth Offset: ${val} deg`);
          }
      }
  }

  disconnect() {
      if (this.client) {
          this.client.end();
          this.client = null;
      }
  }

  /**
   * Rotates the antenna to the specified heading.
   * Automatically compensates for StartAzimuth fetched from hardware.
   * @param {number} heading - Compass Heading (0-360)
   */
  rotate(heading) {
      if (!this.config.rotator.enabled) {
          this.logger.warn("Rotator disabled in config.");
          return;
      }

      if (!this.client || !this.client.connected) {
          this.connect();
      }

      if (this.client) {
          const prefix = this.config.rotator.mqtt.topicPrefix;
          const topic = `${prefix}/Target`;
          
          // --- AUTO-MATH ---
          // Use the fetched value. If we haven't received it yet, it defaults to 0.
          let target = heading - this.remoteStartAzimuth;
          
          if (target < 0) {
              target = 360 + target;
          }
          
          const payload = target.toString();
          // ----------------

          const options = { qos: 0, retain: false };

          this.client.publish(topic, payload, options, (err) => {
              if (err) {
                  this.logger.error(`Failed to publish rotation command: ${err.message}`);
              } else {
                  this.logger.info(`Rotator Command Sent: ${topic} -> ${payload} (Compass: ${heading}, Offset: ${this.remoteStartAzimuth})`);
              }
          });
      }
  }
}

module.exports = MqttRotatorClient;