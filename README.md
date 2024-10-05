
# Wave-Flex-Integrator

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node.js-12%2B-green.svg)](https://nodejs.org/)

A powerful tool that connects your FlexRadio to the Wavelog logging software, integrating DX Cluster data and seamlessly syncing frequency and mode without the need for traditional CAT software. It simplifies your setup, allowing you to focus more on operating and logging your contacts.

> **Note:** This software is currently in beta testing, and the information below may be updated frequently as the project evolves.

> **Note:** This software is currently not listening for logging ADIF brodcasts from programs like WSJT-X but it's a feature that we are considering to add. If you run digital modes, you might want to wait until we've added that functionality.


## Important Notice: Wavelog Features Required

To ensure proper functionality of the Wave-Flex Integrator, two key features developed by Wavelog must be in place:

- Pull Request #978:
  PR [#978](https://github.com/wavelog/wavelog/pull/978) is required to allow the Wavelog browser to open a new logging window for the clicked callsign in SmartSDR. This feature has not yet been merged into Wavelog’s development branch, so it must be applied manually. Merging this pull request manually requires familiarity with Git and GitHub processes. If you're comfortable with these tools, you can apply the changes yourself by pulling the code and merging it into your local Wavelog installation.

- Pull Request [#1017](https://github.com/wavelog/wavelog/pull/1017):
  PR #1017 provides the API that Wave-Flex Integrator uses to enrich spot data, such as DXCC needed status, LoTW membership, and more. This feature was merged into Wavelog's development branch, but at the time of writing, it has not yet been merged into the main repository.
  If you’re comfortable with Git, you can use Wavelog’s dev branch and manually merge these pull requests into your own setup.
  The Wavelog team has announced that the DXCluster-Feature is already part of the latest development branch, and seamless logging will be merged into the main repository within a few days.

In summary, PR #978 requires manual merging, and if you're using the current stable version of Wavelog, you might need to wait until these features are merged into the main repository or switch to the dev branch for full compatibility with Wave-Flex-Integrator.
As an alternative, if you are in a hurry to test things out, I have prepared a fork of Wavelog (dev branch) and applied the required pull request. If you wish you could use my unofficial fork for testing the full functionality by using this command when checking out wavelog.

`git clone --branch dev https://github.com/besynnerlig/wavelog.git wavelog-dev` This will clone the repository into a new folder named wavelog-dev. Use Wavelogs instructions for installing but replace their git clone command with the one given. Doing that will give you an unofficial version of Wavelog and you can expect no support from Wavelog using that of course. You would also need to replace that version with the official one at some point. So it's only recommended if you are sure what you are doing and confident how to restore things back again to the official version.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Introduction

Tired of running multiple programs just to log contacts and integrate with FlexRadio? If you're using [Wavelog's web based Logging Software](https://www.wavelog.org) this tool eliminates the need for CAT software by directly syncing your radio and logging software. **Wave-Flex Integrator** connects to a DX Cluster, processes incoming spots, and enhances them with additional information via the Wavelog API before sending them to your FlexRadio.

When a spot appears on your SmartSDR panadapter, you can click it, and a prefilled Wavelog logging window will open, ready to log the QSO. This application works exclusively with **Wavelog** and **FlexRadio**, and we are not affiliated with either of them. Currently, it supports no other logging software.

## Features

- **DX Cluster Integration**: Automatically connect to a DX Cluster to receive real-time spot data.
- **Spot Augmentation**:
  - Enriches spot data using the Wavelog API, showing whether a callsign’s DXCC is needed for the band or mode, and whether they are a LoTW (Logbook of The World) member.
  - Sends color-coded spots to FlexRadio’s SmartSDR panadapter. Colors can be customized based on DXCC, worked-before status, and LoTW membership.
- **One-Click Logging**: Clicking a spot in SmartSDR opens a Wavelog logging window with the callsign and relevant data prefilled.
- **Error Handling**: Automatically reconnects to the DX Cluster and FlexRadio if the connection drops.
- **Seamless FlexRadio and Wavelog Sync**: Automatically syncs frequency and mode between FlexRadio and Wavelog without the need for CAT software.
- **Cross-Platform Support**: Aims to support Windows, macOS, and Linux.

## Requirements

- **Node.js**: Version 12 or higher for running the application.
- **NPM**: Node Package Manager for installing dependencies.
- **FlexRadio**: Compatible FlexRadio device connected to your LAN or reachable on the Internet over TCP-IP.
- **SmartSDR**: Installed and running on your local machine.
- **Wavelog**: Wavelog logging software (you can try their [demo](https://demo.wavelog.org/user/login)).
- **DX Cluster Access**: Your callsign will be used to access a DX Cluster server of your choice.

> **Note:** While we provide the source code for those who want to run it via Node.js, we will soon offer binaries for easier installation. At the time of writing, Wavelog’s main repository has not yet merged the new API features required. You can, however, use Wavelog’s development branch, where these features are already included. Stay tuned for updates on this.

## Prerequisites for Windows Installation

Before installing, ensure the following prerequisites are met:

- **Node.js**: Download and install the latest version of Node.js [here](https://nodejs.org/). The application requires at least version 12.
- **NPM**: Installed automatically with Node.js. Verify your version using `npm -v` and update it if necessary by running `npm install -g npm`.
- **Git**: Install Git for version control and repository cloning from [here](https://git-scm.com/).
- **FlexRadio**: Your FlexRadio device must be connected to the same network as your computer, or accessible via TCP/IP.
- **SmartSDR**: Ensure SmartSDR is installed and configured on your local computer to interact with FlexRadio.

## Installation

### Windows NPM Installation

```bash
git clone https://github.com/tnxqso/wave-flex-integrator.git
cd wave-flex-integrator
npm install
npm start
```

For other platforms like macOS or Linux, or if you prefer to use a binary, we will provide specific instructions soon.

## Configuration

Upon first startup, you will need to configure the application via the **Configuration Tab**. The details you input will be saved automatically using Electron JSON storage. Here are the fields you need to configure:

### Configuration Parameters

- **DX Cluster Settings**:
  - `Host`: The hostname or IP address of your DX Cluster server.
  - `Port`: The port number of your DX Cluster server.
  - `Callsign`: Your amateur radio callsign used for login.
  - `Login Prompt`: The login prompt format for your DX Cluster (optional).
  - `Commands After Login`: Commands you want the system to send after successfully logging in (optional).
  - `Reconnect Settings`: Configure reconnection behavior with initial delay, max delay, and backoff factor.
 
> **Tip:** If you plan to use a DX Cluster server other than the default (dxc.mx0nca.uk on port 7373 is a good alternative for Europe), it is highly recommended that you first connect to the DX Cluster using a Telnet client like [Putty](https://www.putty.org/). This allows you to verify that the login prompt matches your configured settings and that any custom commands will work without errors. There are many DX Clusters available, so if needed, search the internet for alternatives.

- **FlexRadio Settings**:
  - `Enabled`: Enable or disable FlexRadio integration.
  - `Host`: The hostname or IP address of your FlexRadio device.
  - `Port`: The port number to connect to FlexRadio.
  - `Spot Management`: Customize how long spots remain active and their display colors.

> **Tip:** Coloring the spots sometimes gives other results than expected when shown on the SmartSDR panadapter. Use the default colors to start with and change only a single color at a time.

- **Wavelog Settings**:
  - `BASE URL`: The base URL for your Wavelog API, e.g. `https://YOURSERVERNAME/index.php`. Keep the /index.php at the end unless you have <a target="new" href="https://github.com/wavelog/Wavelog/wiki/Wavelog.php-Configuration-File">modified Wavelogs .htaccess file using mod_rewrite</a>)
  - `API Key`: Your Wavelog API key. You can generate one by clicking your account at top right corner --> API Keys
  - `Station Location IDs`: A comma-separated list of station location IDs (optional). If you don't want the API to search all your station locations defined in Wavelog, otherwise leave blank.

- **Logging Settings**:
  - `Level`: Set the logging level (error, warn, info, debug).
  - `Debug Mode`: Enable or disable debug logging. Warning, debug mode is very verbose.

## Usage

Simply run the application after configuring it:

```bash
npm start
```

For binary installations, details will be provided soon.

## Contributing

Contributions are welcome! If you have skills in JavaScript, Node.js, or amateur radio integration, feel free to open an issue or submit a pull request on GitHub. Help us enhance features, fix bugs, and grow this project.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Interested in enhancing your FlexRadio experience? Become a beta tester or contributor! Learn more about the project and join the discussion at [FlexRadio Community](https://community.flexradio.com/discussion/comment/20613338).

## Acknowledgments

- [FlexRadio Systems](https://www.flexradio.com/)
- [Wavelog Logging Software](https://www.wavelog.org)
- [DX Cluster Networks](http://www.dxcluster.info/)
- Thanks to all contributors and the amateur radio community for their support.
