# Vehicle Enrollment Service

A robust Node.js service that manages vehicle enrollments with VIN validation, caching, and persistent storage capabilities.

## Description

This service provides a comprehensive vehicle enrollment system with the following features:
- RESTful API endpoints for enrollment management
- Redis caching for improved performance
- MySQL database for persistent storage
- Rate limiting
- Request logging
- Automatic enrollment status updates
- Input validation

## Prerequisites

- Node.js
- MySQL
- Redis
- Docker (recommended)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_username
DB_PASSWORD=your_password
DB_DATABASE=your_database_name
```

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Dependencies

- express
- mysql2
- ioredis
- uuid
- node-cron
- express-rate-limit
- morgan
- express-validator
- dotenv

## Database Schema

### Enrollments Table
```sql
CREATE TABLE enrollments (
    enrollment_id VARCHAR(36) PRIMARY KEY,
    vin VARCHAR(17) NOT NULL,
    decoded_details JSON,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status ENUM('inProgress', 'succeeded', 'failed') DEFAULT 'inProgress',
    INDEX idx_vin (vin)
);
```

## API Endpoints

### Enroll Vehicle
- **URL**: `/enroll`
- **Method**: `POST`
- **Rate Limit**: 100 requests per 15 minutes
- **Body**:
```json
{
    "vin": "17CHAR_VIN_NUMBER",
    "decodedDetails": {
        // Vehicle details object
    }
}
```
- **Response**: 
  - Success (202): `{ "enrollmentId": "uuid" }`
  - Error (409): Vehicle already exists
  - Error (400): Invalid input

### Check Enrollment Status
- **URL**: `/status/:enrollmentId`
- **Method**: `GET`
- **Response**:
```json
{
    "status": "inProgress|succeeded|failed"
}
```

### Get Vehicle Details
- **URL**: `/vehicle/:vin`
- **Method**: `GET`
- **Response**:
```json
{
    "vin": "17CHAR_VIN_NUMBER",
    "decodedDetails": {
        // Vehicle details object
    }
}
```

## Caching Strategy

The service implements a multi-level caching strategy:
1. Redis cache for enrollment status (TTL: 1 hour)
2. Redis cache for vehicle details (TTL: 1 hour)
3. Automatic cache invalidation on status updates

## Background Jobs

### Enrollment Status Update
- Runs every minute
- Updates 'inProgress' enrollments to 'succeeded' after 2 minutes
- Automatically invalidates related caches

## Error Handling

The service includes comprehensive error handling for:
- Database connection issues
- Redis connection issues
- Invalid input validation
- Duplicate entries
- Server errors

## Monitoring

- Request logging using Morgan
- Error logging for critical operations
- Background job execution logging

## Security Features

1. Rate Limiting
   - 100 requests per 15 minutes per IP
2. Input Validation
   - VIN format validation
   - UUID validation for enrollment IDs
3. Prepared SQL statements to prevent SQL injection

## Performance Considerations

- Indexed VIN field for faster queries
- Redis caching for frequently accessed data
- Efficient background job processing
- Connection pooling for database operations

## Contributing

Feel free to submit issues and enhancement requests.


## Future Improvements

- Add metrics collection
- Implement circuit breaker pattern
- Add API documentation using Swagger/OpenAPI
- Implement more comprehensive monitoring
- Add health check endpoints 