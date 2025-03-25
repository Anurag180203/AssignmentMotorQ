# CSV to Kafka API

A Node.js Express API that processes CSV files and streams VIN numbers to a Kafka topic.

## Description

This API provides an endpoint for uploading CSV files containing vehicle identification numbers (VINs). Upon upload, the API reads the CSV file and streams each VIN to a configured Kafka topic.

## Prerequisites

- Node.js
- Apache Kafka
- Docker (recommended for Kafka setup)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
PORT=<your_port_number>
KAFKA_CLIENT_ID=<your_kafka_client_id>
KAFKA_BROKER=<your_kafka_broker_address>
KAFKA_TOPIC=<your_kafka_topic_name>
```

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Dependencies

- express
- multer
- csv-parser
- kafkajs
- dotenv

## API Endpoints

### Upload CSV File
- **URL**: `/upload`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Request Body**: 
  - `file`: CSV file containing VIN numbers (field name must be "VIN")

### Response
- **Success Response**: "File uploaded successfully"
- **Error Response**: "No file uploaded." (400 Bad Request)

## File Storage

Uploaded files are stored in the `uploads/` directory with their original filenames.

## Usage Example

```bash
curl -X POST -F "file=@your_file.csv" http://localhost:your_port/upload
```

## Error Handling

The API includes basic error handling for:
- Missing file uploads
- File processing errors

## Contributing

Feel free to submit issues and enhancement requests.