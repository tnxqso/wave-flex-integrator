// certificate_manager.js
'use strict';

const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { execSync } = require('child_process');

class CertificateManager {
  constructor(appPath, logger) {
    this.certDir = path.join(appPath, 'certs');
    this.keyPath = path.join(this.certDir, 'server.key');
    this.certPath = path.join(this.certDir, 'server.crt');
    this.logger = logger;
  }

  /**
   * Generates a self-signed certificate for localhost/127.0.0.1 if it doesn't exist.
   * Returns the paths to the key and cert.
   */
  getOrCreateCertificate() {
    if (fs.existsSync(this.keyPath) && fs.existsSync(this.certPath)) {
      return {
        key: fs.readFileSync(this.keyPath),
        cert: fs.readFileSync(this.certPath)
      };
    }

    this.logger.info('Generating new self-signed SSL certificates...');
    if (!fs.existsSync(this.certDir)) {
      fs.mkdirSync(this.certDir, { recursive: true });
    }

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [{ name: 'commonName', value: '127.0.0.1' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([{
      name: 'subjectAltName',
      altNames: [{ type: 7, ip: '127.0.0.1' }, { type: 2, value: 'localhost' }]
    }]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const certPem = forge.pki.certificateToPem(cert);

    fs.writeFileSync(this.keyPath, keyPem);
    fs.writeFileSync(this.certPath, certPem);

    return { key: keyPem, cert: certPem };
  }

  /**
   * Attempts to install the certificate into the Windows Root store.
   * This requires an elevation prompt (UAC).
   */
  async installOnWindows() {
    if (process.platform !== 'win32') return false;

    try {
      // Command to install cert into Root store via certutil
      const cmd = `certutil -addstore -f Root "${this.certPath}"`;
      // We use PowerShell to trigger the UAC prompt
      const psCommand = `Start-Process powershell -ArgumentList '-Command', '${cmd}' -Verb RunAs`;
      
      execSync(`powershell -Command "${psCommand}"`);
      this.logger.info('Windows certificate installation triggered.');
      return true;
    } catch (error) {
      this.logger.error(`Failed to install certificate: ${error.message}`);
      return false;
    }
  }
}

module.exports = CertificateManager;