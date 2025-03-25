# VIN Polling Client

A Node.js service that consumes VIN numbers from Kafka, decodes them using the NHTSA API, and processes the vehicle information.

## Description

This service provides a robust VIN decoding system with the following features:
- Kafka consumer for processing VIN numbers
- Rate-limited NHTSA API integration
- REST API endpoints for manual VIN processing
- File watching capabilities for CSV processing
- Vehicle information enrollment system

## Prerequisites

- Node.js
- Apache Kafka
- Access to NHTSA Vehicle API
- Docker (recommended for Kafka setup)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
PORT=3002
KAFKA_CLIENT_ID=<your_kafka_client_id>
KAFKA_BROKER=<your_kafka_broker_address>
KAFKA_TOPIC=<your_kafka_topic_name>
KAFKA_GROUP_ID=<your_consumer_group_id>
```

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Dependencies

- express
- axios
- kafkajs
- body-parser
- dotenv
- fs (Node.js built-in)
- path (Node.js built-in)

## Features

### Rate Limiting
- Token bucket implementation
- 5 requests per minute to NHTSA API
- Automatic token refill system

### API Endpoints

#### Health Check
- **URL**: `/health`
- **Method**: `GET`
- **Response**: Status of the service

#### Decode VINs
- **URL**: `/decode`
- **Method**: `POST`
- **Body**: 
```json
{
    "vins": ["VIN1", "VIN2", ...]
}
```

#### Process File
- **URL**: `/process-file`
- **Method**: `POST`
- **Body**: 
```json
{
    "filename": "your_file.csv"
}
```

### Vehicle Information Decoded
The service extracts the following information for each VIN:
- Make
- Model
- Model Year
- Manufacturer Name
- Series
- Vehicle Type
- Plant Country
- Body Class

### File Storage
- Processed files are stored in the `decoded/` directory
- Input files should be placed in the `uploads/` directory

## Usage

### Starting the Service
```bash
node index.js
```

### Kafka Consumer
The service automatically starts consuming VIN numbers from the configured Kafka topic and processes them through the NHTSA API.

### Manual VIN Processing
```bash
curl -X POST -H "Content-Type: application/json" -d '{"vins": ["VIN1", "VIN2"]}' http://localhost:3002/decode
```

### File Processing
```bash
curl -X POST -H "Content-Type: application/json" -d '{"filename": "vins.csv"}' http://localhost:3002/process-file
```

## Error Handling

The service includes comprehensive error handling for:
- API rate limiting
- Invalid VIN numbers
- File processing errors
- Kafka connection issues
- NHTSA API communication errors

## Architecture

The service is built around the `VinDecodingServer` class, which handles:
1. Kafka message consumption
2. Rate-limited API calls
3. File system operations
4. REST API endpoints
5. Vehicle information enrollment

## Data Flow

1. VINs are consumed from Kafka topic
2. Each VIN is rate-limited and processed through NHTSA API
3. Decoded information is stored and sent to enrollment service
4. Results are saved in JSON format

## Contributing

Feel free to submit issues and enhancement requests.
