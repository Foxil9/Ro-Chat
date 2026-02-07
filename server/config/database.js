const mongoose = require('mongoose');
const logger = require('../logging/logger');

const MONGODB_URI = process.env.DB_URL || 'mongodb://localhost:27017/rochat';

// Circuit breaker state
let circuitBreakerState = 'closed'; // closed, open, half-open
let lastFailureTime = 0;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 60 seconds

/**
 * Connect to MongoDB with exponential backoff retry and circuit breaker
 */
async function connectDatabase() {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 1000; // 1 second

  // Enforce strict query mode globally - reject unknown query filters
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Check circuit breaker
      if (circuitBreakerState === 'open') {
        const timeSinceFailure = Date.now() - lastFailureTime;
        if (timeSinceFailure < CIRCUIT_BREAKER_TIMEOUT) {
          logger.warn('Circuit breaker open, skipping connection attempt', {
            attempt,
            waitTime: CIRCUIT_BREAKER_TIMEOUT - timeSinceFailure
          });
          throw new Error('Circuit breaker open');
        } else {
          // Transition to half-open
          circuitBreakerState = 'half-open';
          logger.info('Circuit breaker half-open, attempting connection');
        }
      }

      logger.info('Connecting to MongoDB', { attempt, maxRetries: MAX_RETRIES });

      await mongoose.connect(MONGODB_URI, {
        // Limit connection pool to prevent resource exhaustion
        maxPoolSize: 10,
        // Close sockets after 45 seconds of inactivity
        socketTimeoutMS: 45000,
        // Timeout initial connection after 10 seconds
        serverSelectionTimeoutMS: 10000
      });

      logger.info('Connected to MongoDB successfully', { attempt });

      // Reset circuit breaker on success
      circuitBreakerState = 'closed';
      lastFailureTime = 0;

      // Set up event listeners
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error', { error: error.message });
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });

      process.on('SIGINT', async () => {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      });

      return; // Success!

    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;

      logger.error('MongoDB connection failed', {
        error: error.message,
        attempt,
        maxRetries: MAX_RETRIES,
        isLastAttempt
      });

      if (isLastAttempt) {
        // Open circuit breaker
        circuitBreakerState = 'open';
        lastFailureTime = Date.now();

        logger.error('All MongoDB connection attempts failed. Circuit breaker opened.');
        process.exit(1);
      }

      // Calculate exponential backoff delay: 1s, 5s, 15s
      const delay = BASE_DELAY * Math.pow(5, attempt - 1);
      logger.info(`Retrying MongoDB connection in ${delay}ms`, { attempt });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Get circuit breaker status (for health endpoint)
 */
function getCircuitBreakerStatus() {
  return {
    state: circuitBreakerState,
    isConnected: mongoose.connection.readyState === 1,
    lastFailureTime: lastFailureTime > 0 ? new Date(lastFailureTime).toISOString() : null
  };
}

module.exports = connectDatabase;
module.exports.getCircuitBreakerStatus = getCircuitBreakerStatus;
