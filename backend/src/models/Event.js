const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    facultyName: {
      type: String,
      default: 'Faculty Instructor',
    },
    latitude: {
      type: Number,
      required: true,
      default: 28.6139,
    },
    longitude: {
      type: Number,
      required: true,
      default: 77.2090,
    },
    allowedRadiusMeters: {
      type: Number,
      default: 50,
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'ended'],
      default: 'paused',
    },
    isEnded: {
      type: Boolean,
      default: false,
    },
    customFields: {
      requireMobileNumber: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Event', eventSchema);
