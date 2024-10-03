
# Wavelog-FlexRadio-Integrator

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node.js-12%2B-green.svg)](https://nodejs.org/)

A Node.js application that connects to a DX Cluster, processes incoming spots, augments them with additional data using the Wavelog API, and integrates seamlessly with FlexRadio and Wavelog logging software.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Examples](#examples)
- [Logging](#logging)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Introduction

**Wavelog-FlexRadio-Integrator** is a Node.js application designed for amateur radio enthusiasts who want to enhance their FlexRadio experience with enriched DX Cluster spot data and seamless integration with Wavelog logging software.

The program connects to a DX Cluster, processes incoming spots, enriches them with additional information (like whether the station has been worked before or if they use Logbook of The World (LoTW)), and then forwards the augmented spots to your FlexRadio for display on SmartSDR's panadapter. When you click on a spot in the SmartSDR panadapter, the application automatically opens a logging window in Wavelog for the corresponding callsign.

Spots can also be color-coded to indicate whether a callsign has been worked before and whether the station is a member of LoTW.

This tool enhances your radio operation by providing real-time, enriched spot data directly to your FlexRadio, allowing for more efficient and informed decision-making during your amateur radio activities.

## Features

- **DX Cluster Connection**: Seamlessly connect to a DX Cluster to receive real-time spot data.
- **Spot Augmentation**:
  - Enrich spot data with additional information such as whether you've worked the station before and if they are a LoTW member.
  - **Color-coded spots** to indicate if a callsign has been worked before and if it uses Logbook of The World (LoTW).
- **FlexRadio Integration**:
  - Automatically send processed spots to your FlexRadio client.
  - **Clickable spots** in SmartSDR panadapter open a logging window in Wavelog for the selected callsign.
- **Wavelog Logging Integration**: Direct interaction with Wavelog to facilitate quick and easy logging of contacts.
- **Robust Error Handling**: Automatic reconnection to DX Cluster and FlexRadio in case of connection issues.
- **Logging**: Comprehensive logging using Winston for easier debugging and monitoring.
- **Configurable Commands**: Send custom commands to the DX Cluster after login.

## Requirements

- **Node.js**: Version 12 or higher
- **NPM**: Node Package Manager
- **FlexRadio**: Compatible FlexRadio device on your network
- **SmartSDR**: SmartSDR running on your local computer
- **Wavelog**: Wavelog logging software installed and configured
- **DX Cluster Access**: Credentials and access to a DX Cluster server

## Installation

### Clone the Repository

```bash
git clone https://github.com/yourusername/wavelog-flexradio-integrator.git
cd wavelog-flexradio-integrator
```

### Install Dependencies

```bash
npm install
```

## Configuration

The application uses a `config.json` file for configuration. An example `config.example.json` file is provided as a template. You should copy or rename this file to `config.json` and update it with your specific configuration settings.

```bash
cp config.example.json config.json
```

### Configuration Parameters

- **DX Cluster Settings**:
  - `host`: The hostname or IP address of your DX Cluster server.
  - `port`: The port number of your DX Cluster server.
  - `callsign`: Your amateur radio callsign used for login.
  - `commands`: An array of commands to send after successful login.

- **FlexRadio Settings**:
  - `enabled`: Set to `true` to enable FlexRadio integration.
  - `host`: The hostname or IP address of your FlexRadio.
  - `port`: The port number for FlexRadio connections.
  - `spotManagement`:
    - `lifetimeSeconds`: Duration for which spots remain active.
    - `colors`: Customize spot colors based on conditions.

- **Wavelog API Settings**:
  - `URL`: The base URL for your Wavelog API.

- **Logging Settings**:
  - `level`: Logging level (e.g., `info`, `debug`, `error`).

## Usage

### Running the Application

```bash
node index.js
```

### PM2 Process Manager (Optional)

For production environments, it's recommended to use PM2 to manage the Node.js application:

```bash
npm install -g pm2
pm2 start index.js --name wavelog-flexradio-integrator
```

## Examples

### DX Cluster Connection

The application connects to your specified DX Cluster and logs in using your callsign. After login, it can send custom commands specified in the configuration.

### Spot Augmentation

Each incoming spot is processed and augmented with additional data, such as:

- Whether you have worked the station before.
- If the station is a member of LoTW.

### FlexRadio Integration

Augmented spots are sent to your FlexRadio client, appearing in the SmartSDR panadapter. Clicking on a spot will open a logging window in Wavelog for that callsign.

## Logging

The application uses Winston for logging. Logs are output to the console with timestamps and log levels.

You can configure the logging level in the `config.json` file:

```json
"logger": {
  "level": "info"
}
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [FlexRadio Systems](https://www.flexradio.com/)
- [Wavelog Logging Software](https://wavelog.example.com/)
- [DX Cluster Networks](http://www.dxcluster.info/)
- Thanks to all contributors and the amateur radio community for their support.
