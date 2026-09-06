// update_checker.js
//
// Manual update check for platforms where electron-updater cannot install an
// update by itself. On macOS, Squirrel.Mac requires the application bundle to
// be signed with an Apple Developer ID certificate, which this project does
// not have. Rather than failing silently, we ask the GitHub releases API
// whether a newer version exists and tell the user, who then installs it by
// hand.

const https = require('https');
const path = require('path');
const { app, shell, Notification } = require('electron');

const RELEASES_API_URL =
  'https://api.github.com/repos/tnxqso/wave-flex-integrator/releases/latest';
const RELEASES_PAGE_URL =
  'https://github.com/tnxqso/wave-flex-integrator/releases/latest';
const REQUEST_TIMEOUT_MS = 15000;

// Electron 44 dropped support for macOS 12 and earlier. Users on those systems
// cannot run current releases, so they must not be prompted to install one.
const MINIMUM_MACOS_MAJOR = 13;

// Remembers the version the user was last told about, so the periodic check
// does not raise the same notification every few hours.
let notifiedVersion = null;

/**
 * Splits a version string into numeric components.
 * Accepts an optional leading "v" and ignores any suffix after the patch
 * number.
 * @param {string} value - Version or tag name, for example "v2.0.0".
 * @returns {number[]|null} [major, minor, patch], or null if unparsable.
 */
function parseVersion(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Determines whether one version is strictly newer than another.
 * @param {string} candidate - Version to test.
 * @param {string} current - Version to compare against.
 * @returns {boolean} True when candidate is newer than current.
 */
function isNewerVersion(candidate, current) {
  const parsedCandidate = parseVersion(candidate);
  const parsedCurrent = parseVersion(current);

  if (!parsedCandidate || !parsedCurrent) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    if (parsedCandidate[index] > parsedCurrent[index]) {
      return true;
    }
    if (parsedCandidate[index] < parsedCurrent[index]) {
      return false;
    }
  }

  return false;
}

/**
 * Reports whether this machine can run current releases.
 * Only macOS is constrained; every other platform passes.
 * @param {object} logger - Application logger.
 * @returns {boolean} True when an update would be installable here.
 */
function isSupportedPlatformVersion(logger) {
  if (process.platform !== 'darwin') {
    return true;
  }

  const systemVersion = process.getSystemVersion();
  const major = Number.parseInt(systemVersion, 10);

  if (Number.isNaN(major)) {
    logger.warn(
      `Could not parse the macOS version "${systemVersion}". Assuming the update is installable.`
    );
    return true;
  }

  return major >= MINIMUM_MACOS_MAJOR;
}

/**
 * Fetches the newest published release from the GitHub API.
 * Pre-releases are excluded by the endpoint itself.
 * @returns {Promise<object>} Parsed release object.
 */
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = https.get(
      RELEASES_API_URL,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `wave-flex-integrator/${app.getVersion()}`,
        },
      },
      (response) => {
        // Use response.status, never statusText: the latter is unreliable
        // over HTTP/2.
        const status = response.statusCode;
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });

        response.on('end', () => {
          if (status !== 200) {
            reject(new Error(`GitHub releases API returned HTTP ${status}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(
              new Error(`Could not parse the GitHub releases response: ${error.message}`)
            );
          }
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Timed out while contacting the GitHub releases API'));
    });

    request.on('error', reject);
  });
}

/**
 * Shows a desktop notification that opens the release page when clicked.
 * @param {string} version - Version that is available.
 * @param {string} url - Page to open.
 * @param {object} logger - Application logger.
 */
function showUpdateNotification(version, url, logger) {
  if (!Notification.isSupported()) {
    logger.warn('Desktop notifications are unavailable; skipping the update notice.');
    return;
  }

  const notification = new Notification({
    title: 'Wave-Flex Integrator update available',
    body: `Version ${version} has been released. Click to open the download page.`,
    icon: path.join(__dirname, 'assets/icons/icon.png'),
  });

  notification.on('click', () => {
    shell.openExternal(url).catch((error) => {
      logger.error(`Could not open the release page: ${error.message}`);
    });
  });

  notification.show();
}

/**
 * Checks GitHub for a newer release and notifies the user if one exists and
 * can actually be installed on this system. Never throws.
 * @param {object} logger - Application logger.
 * @returns {Promise<void>}
 */
async function checkForNewRelease(logger) {
  const currentVersion = app.getVersion();

  try {
    const release = await fetchLatestRelease();
    const latestVersion = release ? release.tag_name : null;

    if (!isNewerVersion(latestVersion, currentVersion)) {
      logger.info(
        `Update check: running ${currentVersion}, latest published is ${latestVersion}. Nothing to do.`
      );
      return;
    }

    if (!isSupportedPlatformVersion(logger)) {
      logger.info(
        `Update check: ${latestVersion} is available but requires macOS ${MINIMUM_MACOS_MAJOR} or later. This system reports ${process.getSystemVersion()}. Not notifying.`
      );
      return;
    }

    if (notifiedVersion === latestVersion) {
      logger.info(`Update check: the user has already been notified about ${latestVersion}.`);
      return;
    }

    notifiedVersion = latestVersion;
    logger.info(`Update check: ${latestVersion} is available, running ${currentVersion}.`);
    showUpdateNotification(latestVersion, release.html_url || RELEASES_PAGE_URL, logger);
  } catch (error) {
    logger.error(`Update check failed: ${error && error.message ? error.message : error}`);
  }
}

module.exports = {
  checkForNewRelease,
  isNewerVersion,
  parseVersion,
};