'use strict';
const mqtt = require('mqtt');

class MqttRotatorClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger || console;
    this.client = null;

    this.remoteStartAzimuth = this.config.rotator.startAzimuth || 137;
    this.rotationRange = this.config.rotator.rotationRange || 446;
    
    /**
     * Tracks the current raw position of the rotor to calculate the shortest path.
     */
    this.currentRawAzimuth = 0;
  }

  setConfig(newConfig) {
      this.config = newConfig;
      // Update values dynamically if config changes
      this.remoteStartAzimuth = this.config.rotator.startAzimuth;
      this.rotationRange = this.config.rotator.rotationRange;
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
      
      // Only subscribe to Azimuth to track current position
      // We do not subscribe to config topics as the hardware doesn't provide them
      const topic = `${prefix}/Azimuth`;

      this.client.subscribe(topic, (err) => {
          if (!err) {
              this.logger.debug(`Subscribed to ${topic}`);
              
              // Trigger a sync/get command to force rotor to send its status (Azimuth)
              const getTopic = `${prefix}/get`;
              this.client.publish(getTopic, "1"); 
          }
      });
  }

  handleMessage(topic, message) {
      const prefix = this.config.rotator.mqtt.topicPrefix;
      const msgString = message.toString();
      const val = parseInt(msgString);

      if (isNaN(val)) return;

      // We only care about current raw position updates
      if (topic === `${prefix}/Azimuth`) {
          this.currentRawAzimuth = val;
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
   * Calculates the shortest path by utilizing the overlap zone if available.
   * @param {number} heading - Compass Heading (0-360)
   */
  rotate(heading) {
      if (!this.config.rotator.enabled) {
          this.logger.warn("Rotator disabled in config.");
          return;
      }

      if (!this.client || !this.client.connected) {
          this.connect();
          return; // Wait for connection
      }

      const prefix = this.config.rotator.mqtt.topicPrefix;
      const topic = `${prefix}/Target`;
      
      // --- LOGIC: Calculate Shortest Path (Overlap Support) ---

      // 1. Calculate the primary raw target (0-359 range adjusted for offset)
      let targetOption1 = heading - this.remoteStartAzimuth;
      
      // Normalize negative values.
      // Example: Heading 100, Offset 137 -> -37 -> +360 = 323 Raw.
      if (targetOption1 < 0) {
          targetOption1 += 360;
      }

      // 2. Calculate the secondary raw target (the overlap option, 360+ range)
      let targetOption2 = targetOption1 + 360;

      // 3. Determine which valid raw target is closest to our current position
      let finalRawTarget = targetOption1;
      
      // Check if the overlap option is physically possible within the Configured Rotation Range
      if (targetOption2 <= this.rotationRange) {
          const dist1 = Math.abs(targetOption1 - this.currentRawAzimuth);
          const dist2 = Math.abs(targetOption2 - this.currentRawAzimuth);

          if (dist2 < dist1) {
              finalRawTarget = targetOption2;
              this.logger.debug(`Choosing overlap path for shorter rotation (Target: ${targetOption2}).`);
          }
      }

      // 4. Final safety check against physical limits
      if (finalRawTarget > this.rotationRange) {
          this.logger.warn(`Calculated target ${finalRawTarget} exceeds limit ${this.rotationRange}. Fallback to primary.`);
          finalRawTarget = targetOption1;
      }
      
      const payload = finalRawTarget.toString();
      // ----------------

      const options = { qos: 0, retain: false };

      this.client.publish(topic, payload, options, (err) => {
          if (err) {
              this.logger.error(`Failed to publish rotation command: ${err.message}`);
          } else {
              this.logger.info(`Rotator Command Sent: Heading ${heading}° -> Raw ${payload} (Range: ${this.rotationRange}, Offset: ${this.remoteStartAzimuth})`);
          }
      });
  }
}

module.exports = MqttRotatorClient;