# Vehicle Information Processing System

A distributed system for processing, decoding, and managing vehicle information through VIN numbers.

## System Architecture

This project consists of three microservices working together to process vehicle information:

1. **CSV to Kafka API**: Ingests CSV files containing VIN numbers and streams them to Kafka
2. **VIN Polling Client**: Consumes VINs from Kafka and decodes them using NHTSA API
3. **Enrollment Service**: Manages vehicle enrollment and storage with caching capabilities

## Services Overview

### 1. CSV to Kafka API
- Handles CSV file uploads
- Streams VIN numbers to Kafka
- [View CSV to Kafka API Documentation](./API/README.md)

### 2. VIN Polling Client
- Consumes VINs from Kafka
- Integrates with NHTSA API for VIN decoding
- Rate-limited API processing
- [View VIN Polling Client Documentation](./POLLINGclient/README.md)

### 3. Enrollment Service
- Manages vehicle enrollment process
- Redis caching layer
- MySQL persistent storage
- [View Enrollment Service Documentation](./EnrollmentService/README.md)

## Prerequisites

- Node.js
- Apache Kafka
- Redis
- MySQL
- Docker (recommended)
- Access to NHTSA Vehicle API

## Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
```

2. Set up environment variables for each service (see individual READMEs)

3. Start the services:

Before starting up the services, you need to have mySQL server, Kafka and Redis set up on your system. Recommended way is to use Docker to simply create the three containers and expose their respective ports. 

```bash

# Install dependencies and start each service
cd API && npm install && npm start
cd POLLINGclient && npm install && npm start
cd EnrollmentService && npm install && npm start
```

## System Flow

1. User uploads CSV file containing VIN numbers to CSV to Kafka API
2. VINs are streamed to Kafka topic
3. VIN Polling Client consumes VINs and decodes them using NHTSA API
4. Decoded vehicle information is sent to Enrollment Service
5. Enrollment Service processes and stores vehicle information
6. Users can query vehicle status and information through REST APIs

## Environment Setup

Each service requires its own environment variables. Create separate `.env` files in each service directory:

### API Service
```env
PORT=3001
KAFKA_CLIENT_ID=csv-api
KAFKA_BROKER=localhost:9092
KAFKA_TOPIC=vin-topic
```

### VIN Polling Client
```env
PORT=3002
KAFKA_CLIENT_ID=vin-poller
KAFKA_BROKER=localhost:9092
KAFKA_TOPIC=vin-topic
KAFKA_GROUP_ID=vin-processor
```

### Enrollment Service
```env
PORT=3003
REDIS_HOST=localhost
REDIS_PORT=6379
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_username
DB_PASSWORD=your_password
DB_DATABASE=your_database_name
```

## API Documentation

### CSV Upload
- **Endpoint**: `http://localhost:3001/upload`
- **Method**: POST
- **Content-Type**: multipart/form-data

### Vehicle Enrollment
- **Endpoint**: `http://localhost:3003/enroll`
- **Method**: POST
- **Content-Type**: application/json

### Vehicle Status
- **Endpoint**: `http://localhost:3003/vehicle/:vin`
- **Method**: GET

## Monitoring and Maintenance

- Each service includes its own logging system
- Rate limiting is implemented where necessary
- Background jobs handle status updates
- Redis caching improves performance
- Database indexes optimize queries

## Error Handling

The system implements comprehensive error handling:
- File processing errors
- API rate limiting
- Network issues
- Database connection problems
- Invalid data validation
