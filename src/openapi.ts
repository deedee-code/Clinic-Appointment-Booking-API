import type { OpenAPIV3 } from "openapi-types";

export const openApiDocument: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Morrowfield Medical Booking API",
    version: "1.0.0",
    description: [
      "API for listing clinic appointment slots and managing bookings.",
      "All contract endpoints require an API key in the X-API-Key header.",
      "The patient-facing web proxy under /web is not part of this contract.",
    ].join(" "),
  },
  servers: [{ url: "/", description: "This server" }],
  tags: [
    { name: "Slots", description: "Clinic appointment availability" },
    { name: "Bookings", description: "Create and manage patient bookings" },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "The API key configured by the service operator.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", example: "Unauthorized" },
        },
      },
      Slot: {
        type: "object",
        required: ["id", "provider", "start", "end", "available"],
        properties: {
          id: { type: "string", example: "s1" },
          provider: { type: "string", example: "Dr Ade" },
          start: { type: "string", format: "date-time", example: "2026-12-10T09:00:00Z" },
          end: { type: "string", format: "date-time", example: "2026-12-10T09:30:00Z" },
          available: { type: "boolean", example: true },
        },
      },
      SlotInput: {
        type: "object",
        required: ["id", "provider", "start", "end"],
        properties: {
          id: { type: "string", maxLength: 100, example: "s1" },
          provider: { type: "string", maxLength: 200, example: "Dr Ade" },
          start: { type: "string", format: "date-time", example: "2026-12-10T09:00:00Z" },
          end: { type: "string", format: "date-time", example: "2026-12-10T09:30:00Z" },
        },
      },
      BookingInput: {
        type: "object",
        additionalProperties: false,
        required: ["slot_id", "name", "email"],
        properties: {
          slot_id: { type: "string", maxLength: 100, example: "s1" },
          name: { type: "string", maxLength: 200, example: "Ada Obi" },
          email: { type: "string", format: "email", maxLength: 254, example: "ada@example.com" },
        },
      },
      Booking: {
        type: "object",
        required: ["id", "slot_id", "name", "email", "status", "created_at"],
        properties: {
          id: { type: "string", example: "booking_abc123" },
          slot_id: { type: "string", example: "s1" },
          name: { type: "string", example: "Ada Obi" },
          email: { type: "string", format: "email", example: "ada@example.com" },
          status: { type: "string", enum: ["confirmed", "cancelled"] },
          created_at: { type: "string", format: "date-time", example: "2026-12-01T10:00:00Z" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Invalid request.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Unauthorized: {
        description: "Missing or invalid API key.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      NotFound: {
        description: "Requested resource was not found.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Conflict: {
        description: "Request conflicts with the current booking state or the slot is taken.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      UnprocessableEntity: {
        description: "Idempotency key was reused with a different request body.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    "/slots": {
      get: {
        tags: ["Slots"],
        summary: "List appointment slots",
        description: "Returns slots ordered by start time. Provider matching is exact.",
        parameters: [{
          name: "provider",
          in: "query",
          required: false,
          schema: { type: "string" },
          description: "Filter by exact provider name.",
        }],
        responses: {
          "200": {
            description: "Slots ordered by start time.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["slots"],
                  properties: {
                    slots: { type: "array", items: { $ref: "#/components/schemas/Slot" } },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/reset": {
      post: {
        tags: ["Slots"],
        summary: "Replace all slots and delete all bookings",
        description: "Destructive administrative operation. Replaces every slot and deletes every booking, including bookings for past slots.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["slots"],
                properties: {
                  slots: {
                    type: "array",
                    items: { $ref: "#/components/schemas/SlotInput" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Slots replaced and bookings deleted." },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/bookings": {
      post: {
        tags: ["Bookings"],
        summary: "Book an appointment slot",
        description: "Creates a booking. Email is normalized to lowercase. Reusing an idempotency key with the same body returns the original booking.",
        parameters: [{
          name: "Idempotency-Key",
          in: "header",
          required: false,
          schema: { type: "string", minLength: 1, maxLength: 255 },
          description: "Optional key used to safely retry a booking request.",
        }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/BookingInput" } } },
        },
        responses: {
          "201": {
            description: "Booking created.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Booking" } } },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
          "422": { $ref: "#/components/responses/UnprocessableEntity" },
          "429": {
            description: "Too many booking attempts for this email.",
            headers: {
              "Retry-After": {
                description: "Seconds until another booking attempt is allowed.",
                schema: { type: "integer" },
              },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
      get: {
        tags: ["Bookings"],
        summary: "List bookings by email",
        description: "Returns one person's bookings oldest first. Pass next_cursor as cursor to get the next page.",
        parameters: [
          {
            name: "email",
            in: "query",
            required: true,
            schema: { type: "string", format: "email", maxLength: 254 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Cursor returned by the previous page.",
          },
        ],
        responses: {
          "200": {
            description: "A page of bookings.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["bookings", "next_cursor"],
                  properties: {
                    bookings: { type: "array", items: { $ref: "#/components/schemas/Booking" } },
                    next_cursor: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/bookings/{id}": {
      parameters: [{
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", maxLength: 200 },
      }],
      get: {
        tags: ["Bookings"],
        summary: "Look up a booking",
        responses: {
          "200": {
            description: "Booking details.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Booking" } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Bookings"],
        summary: "Cancel a booking",
        description: "Cancels a confirmed booking and frees its slot.",
        responses: {
          "200": {
            description: "Cancelled booking.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Booking" } } },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
  },
};
