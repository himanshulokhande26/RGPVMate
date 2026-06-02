const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'dummy-client-id',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy-client-secret',
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/auth/google/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        // Try finding by email
        const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
        if (email) {
          user = await User.findOne({ email });
        }
        if (user) {
          user.googleId = profile.id;
          if (!user.photoUrl && profile.photos && profile.photos.length > 0) {
            user.photoUrl = profile.photos[0].value;
          }
          await user.save();
        } else {
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: email || `${profile.id}@google.com`,
            photoUrl: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null,
          });
        }
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID || 'dummy-client-id',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || 'dummy-client-secret',
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/auth/github/callback`
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ githubId: profile.id });
      if (!user) {
        const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
        if (email) {
          user = await User.findOne({ email });
        }
        if (user) {
          user.githubId = profile.id;
          if (!user.photoUrl && profile.photos && profile.photos.length > 0) {
            user.photoUrl = profile.photos[0].value;
          }
          await user.save();
        } else {
          user = await User.create({
            githubId: profile.id,
            name: profile.displayName || profile.username,
            email: email || `${profile.username}@github.com`,
            photoUrl: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null,
          });
        }
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;
