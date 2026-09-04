const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
      uppercase: true,
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
    },
    regNo: {
      type: String,
      required: true,
      trim: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    year: {
      type: String,
      default: '',
    },
    branch: {
      type: String,
      default: '',
    },
    mobileNumber: {
      type: String,
      default: '',
    },
    verificationMode: {
      type: String,
      enum: ['GPS_VERIFIED', 'ADMIN_MANUAL_OVERRIDE', 'WIFI_VERIFIED', 'SUSPICIOUS_PROXY'],
      default: 'GPS_VERIFIED',
    },
    overrideReason: {
      type: String,
      default: '',
    },
    editedBy: {
      type: String,
      default: '',
    },
    editedAt: {
      type: Date,
      default: null,
    },
    editHistory: [
      {
        previousValues: Object,
        reason: String,
        editedAt: { type: Date, default: Date.now },
      },
    ],
    distanceFromTargetMeters: {
      type: Number,
      default: 0,
    },
    userLocation: {
      latitude: { type: Number, default: 0 },
      longitude: { type: Number, default: 0 },
    },
    deviceUuid: {
      type: String,
      default: '',
    },
    clientIp: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate student attendance for the same session ID
AttendanceSchema.index({ sessionId: 1, regNo: 1 }, { unique: true });
AttendanceSchema.index({ sessionId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);
