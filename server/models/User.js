const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    maxlength: 50
  },
  displayName: {
    type: String,
    maxlength: 100
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

// Note: userId already has an index from unique: true

module.exports = mongoose.model('User', userSchema);
