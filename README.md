# TimeShift — Global Timezone Converter

Chrome extension that converts times between timezones. Right-click any time on the web and convert it instantly.

## Install

**[Download TimeShift.zip](https://github.com/akhil-saxena/convert-timezone/releases/latest/download/TimeShift.zip)**

1. Download and unzip
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the unzipped folder
5. Pin the TimeShift icon to your toolbar

## Features

- **NLP-powered parsing** — handles any time format from any website
- **Right-click to convert** — select text like `3 PM EST` or `12 PM (GMT-5:00) Eastern [US & Canada]`, right-click, and get instant conversion
- **Smart timezone detection** — disambiguates CST (US Central vs China), IST (India vs Israel), BST (British vs Bangladesh) using context clues
- **Dynamic offsets** — always shows current DST state, never stale
- **"Now" button** — one-click to convert your current time to another timezone
- **Copy result** — click to copy the converted time to clipboard
- **Time ranges** — handles `2 PM - 4 PM EST` correctly, including cross-midnight

## Supported Formats

Works with messy real-world text from emails, calendars, sports sites, and more:

```
3:00 PM EST
12 PM (GMT-5:00) Eastern [US & Canada]
Webinar at 2:00 PM EST
The ceremony begins at 7:00 PM CET on March 20th
Kickoff: 8 PM ET (Saturday, March 15)
3pm BST / 10am ET
14:00 - 15:30 CET
12:00 AM GMT-5
```

## Development

```bash
npm install
npm test        # 65 tests
npm run build   # builds libs/chrono.bundle.js
```
