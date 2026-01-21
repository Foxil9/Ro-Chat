const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  displayName: {
    type: String
  },
  robloxToken: {
    type: String,
    select: false // Never return token in queries by default
  },
  lastSeen: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update lastSeen timestamp before saving
userSchema.pre('save', function(next) {
  this.lastSeen = new Date();
  next();
});

// Index for efficient queries
userSchema.index({ userId: 1 });

module.exports = mongoose.model('User', userSchema);
