# Manual Installation Guide (Install from source) for Wave-Flex Integrator

This guide provides step-by-step instructions for manually installing Wave-Flex Integrator on **Windows**, **macOS**, and **Linux** systems. It also includes instructions on how to upgrade the application when new versions are released.

---

## Table of Contents

- [Prerequisites](#prerequisites)
  - [Common Requirements](#common-requirements)
  - [Windows-Specific Requirements](#windows-specific-requirements)
  - [macOS-Specific Requirements](#macos-specific-requirements)
  - [Linux-Specific Requirements](#linux-specific-requirements)
- [Installation](#installation)
  - [Windows Manual Installation](#windows-manual-installation)
  - [macOS Manual Installation](#macos-manual-installation)
  - [Linux Manual Installation](#linux-manual-installation)
- [Configuration](#configuration)
- [Starting the Application](#starting-the-application)
- [Upgrading Wave-Flex Integrator](#upgrading-wave-flex-integrator)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Common Requirements

Before proceeding with the installation, ensure you have the following installed on your system:

- **Node.js**: Version 12 or higher.
  - [Download Node.js](https://nodejs.org/)
  - Verify installation with:

    ```bash
    node -v
    ```

- **NPM**: Comes bundled with Node.js.
  - Verify installation with:

    ```bash
    npm -v
    ```

- **Git**: Required to clone the repository.
  - [Download Git](https://git-scm.com/)
  - Verify installation with:

    ```bash
    git --version
    ```

## Installation

### Windows Manual Installation

1. **Open Command Prompt**:

   - Press `Win + R`, type `cmd`, and press **Enter**.

2. **Clone the Repository**:

   ```bash
   git clone https://github.com/tnxqso/wave-flex-integrator.git
   ```

3. **Navigate to the Directory**:

   ```bash
   cd wave-flex-integrator
   ```

4. **Install Dependencies**:

   ```bash
   npm install
   ```

5. **Install Electron**:

   ```bash
   npm install electron
   ```

### macOS Manual Installation

1. **Open Terminal**:

   - Navigate to **Applications** > **Utilities** > **Terminal**.

2. **Clone the Repository**:

   ```bash
   git clone https://github.com/tnxqso/wave-flex-integrator.git
   ```

3. **Navigate to the Directory**:

   ```bash
   cd wave-flex-integrator
   ```

4. **Install Dependencies**:

   ```bash
   npm install
   ```

5. **Install Electron**:

   ```bash
   npm install electron
   ```

### Linux Manual Installation

1. **Open Terminal**.

2. **Clone the Repository**:

   ```bash
   git clone https://github.com/tnxqso/wave-flex-integrator.git
   ```

3. **Navigate to the Directory**:

   ```bash
   cd wave-flex-integrator
   ```

4. **Install Dependencies**:

   ```bash
   npm install
   ```

5. **Install Electron**:

   ```bash
   npm install electron
   ```

---

## Configuration

Upon first startup, an error message may appear due to missing configuration. This is normal. Configure the application via the **Configuration Tab**, save your settings, and restart.

Refer to the **Configuration Parameters** section in the main `README.md` for detailed information on each setting.

---

## Starting the Application

To start the application, use the following command from the `wave-flex-integrator` directory:

```bash
npm start
```

If you wish to run the application with debug logging enabled, use:

```bash
npm start -- -- --debug
```

---

## Upgrading Wave-Flex Integrator

To update to the latest version:

1. **Navigate to the Application Directory**:

   ```bash
   cd wave-flex-integrator
   ```

2. **Reset Any Local Changes**:

   ```bash
   git reset --hard
   ```

3. **Pull the Latest Code from GitHub**:

   ```bash
   git pull origin main
   ```

4. **Install Updated Dependencies**:

   ```bash
   npm install
   ```

5. **Start the Application**:

   ```bash
   npm start
   ```

---

## Troubleshooting

- **Errors During `npm install`**:
  - Ensure that you have the necessary build tools installed.
  - Delete the `node_modules` directory and run `npm install` again.

- **Application Fails to Start**:
  - Verify that all dependencies are correctly installed.
  - Check for error messages in the terminal.

- **Debugging**:
  - Run the application with the `-- -- --debug` flag to generate a `debug.log` file.
  - Follow the debugging instructions in the main `README.md` under [Debugging and Troubleshooting](README.md#debugging-and-troubleshooting).

---

If you have any questions or need further assistance, feel free to open an issue on the [GitHub repository](https://github.com/tnxqso/wave-flex-integrator/issues).

---

# Additional Notes

- **Mac Users**: If you encounter permission issues, you may need to use `sudo` for some commands, but it's generally recommended to fix permissions instead of using `sudo` with `npm`.

- **Electron Installation**: In some cases, you may need to install Electron globally:

  ```bash
  npm install -g electron
  ```

- **Environment Variables**: Ensure that your `PATH` environment variable includes the locations of Node.js and Git executables.

- **Firewall and Network Settings**: If the application cannot connect to external services, check your firewall and network configurations.

---
