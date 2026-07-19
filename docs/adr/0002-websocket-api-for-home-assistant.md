# 2. Use WebSocket API with Long-Lived Access Tokens for Home Assistant Integration

We have decided to connect to Home Assistant via its WebSocket API using a Long-Lived Access Token (LLAT). This ensures real-time updates for entity states in our custom menu, providing immediate visual feedback without the latency and overhead of HTTP polling.

## Status
Accepted

## Considered Options
- **REST API (Polling):** Simple to implement but introduces latency and high polling overhead for real-time updates.
- **WebSocket API (Chosen):** Allows real-time, bi-directional state events and service execution, delivering a responsive user experience.
