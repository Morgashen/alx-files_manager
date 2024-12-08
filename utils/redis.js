#!/usr/bin/env node

const redis = require('redis');
const { promisify } = require('util');

class RedisClient {
  constructor() {
    this.client = redis.createClient();

    // Handle errors
    this.client.on('error', (err) => {
      console.error('Error connecting to Redis', err);
    });

    // Promisify redis client methods
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
  }

  // Check if Redis connection is alive
  isAlive() {
    return this.client.connected;
  }

  // Get a value from Redis by key
  async get(key) {
    const value = await this.getAsync(key);
    return value;
  }

  // Set a value in Redis with an expiration time
  async set(key, value, duration) {
    await this.setAsync(key, value, 'EX', duration);
  }

  // Delete a value from Redis by key
  async del(key) {
    await this.delAsync(key);
  }
}

// Create and export an instance of RedisClient
const redisClient = new RedisClient();
module.exports = redisClient;
