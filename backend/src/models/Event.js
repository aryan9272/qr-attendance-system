const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    labIdentifier: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    proctorName: {
      type: String,
      default: 'Admin In-Charge',
      trim: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'TERMINATED'],
      default: 'PAUSED',
    },
    allowedRadiusMeters: {
      type: Number,
      default: 50,
    },
    customFields: {
      requireMobileNumber: { type: Boolean, default: false },
      requireWifiVerification: { type: Boolean, default: false },
    },
    isEnded: {
      type: Boolean,
      default: false,
      index: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    terminatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Event', EventSchema);
