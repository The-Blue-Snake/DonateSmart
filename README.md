# DonateSmart

DonateSmart helps find the right place to donate an item in Minneapolis! Search for an item yourself, scan its barcode, or take a photo to identify its category, then find donation centers that accept it.

## Setup

### Requirements

- Node.js and npm
- The DonateSmart donation-center spreadsheets. They are large and are not included in this GitHub repository, so links are below.
- API keys for photo classification and barcode lookup if you want to use those features

### Install and add the spreadsheets

1. Clone the repository and install its dependencies:

   ```sh
   git clone https://github.com/The-Blue-Snake/DonateSmart.git
   cd DonateSmart
   npm install
   ```

2. Download the five spreadsheets below and place the `.xlsx` files in `src/data/`:

   - [Spreadsheet 1](ADD_GOOGLE_SHEET_LINK_1)
   - [Spreadsheet 2](ADD_GOOGLE_SHEET_LINK_2)
   - [Spreadsheet 3](ADD_GOOGLE_SHEET_LINK_3)
   - [Spreadsheet 4](ADD_GOOGLE_SHEET_LINK_4)
   - [Spreadsheet 5](ADD_GOOGLE_SHEET_LINK_5)

3. Generate the donation-center data and photo assets:

   ```sh
   npm run build-centers
   ```

   This step is required before starting the app. It creates `src/data/defaultDonationCenters.ts` and the donation-center photos under `src/assets/donation-centers/`.

### Add API keys (optional)

Photo classification and barcode lookup need their respective API keys. Create a `.env` file in the project root:

```dotenv
EXPO_PUBLIC_GOOGLE_AI_STUDIO_API_KEY=your_google_ai_studio_key
EXPO_PUBLIC_BARCODE_LOOKUP_API_KEY=your_barcode_lookup_key
```

### Run the app

Start Expo:

```sh
npx expo start
```

Open the QR code with Expo Go on a phone, on either Android or iOS.
