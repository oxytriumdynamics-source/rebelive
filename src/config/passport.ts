import passport from 'passport';
import {
  Strategy as GoogleStrategy,
  Profile as GoogleProfile,
} from 'passport-google-oauth20';
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions } from 'passport-jwt';
import { Request } from 'express';
import { prisma } from './database';
import { env } from './env';
import { logger } from '../shared/utils/logger';

// ─── JWT Strategy ──────────────────────────────────────
// Extracts JWT from Authorization header OR HttpOnly cookie

const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.accessToken ?? null;
};

const jwtOptions: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromExtractors([
    ExtractJwt.fromAuthHeaderAsBearerToken(),
    cookieExtractor,
  ]),
  secretOrKey: env.JWT_ACCESS_SECRET,
  passReqToCallback: false,
};

passport.use(
  'jwt',
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub as string },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          emailVerified: true,
        },
      });

      if (!user) return done(null, false);
      return done(null, user);
    } catch (err) {
      logger.error('JWT Strategy error:', err);
      return done(err, false);
    }
  }),
);

// ─── Google OAuth 2.0 Strategy ────────────────────────

passport.use(
  'google',
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
      scope: ['profile', 'email'],
    },
    async (_accessToken, _refreshToken, profile: GoogleProfile, done) => {
      try {
        const email =
          profile.emails && profile.emails[0]?.value;

        if (!email) {
          return done(new Error('No email returned from Google'), undefined);
        }

        // Upsert user by googleId OR email
        let user = await prisma.user.findFirst({
          where: { OR: [{ googleId: profile.id }, { email }] },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              googleId: profile.id,
              authProvider: 'google',
              firstName: profile.name?.givenName ?? '',
              lastName: profile.name?.familyName ?? '',
              avatarUrl: profile.photos?.[0]?.value ?? null,
              emailVerified: true,
              role: 'CUSTOMER',
              refreshTokens: [],
            },
          });
          logger.info(`[Auth] New Google user created: ${email}`);
        } else if (!user.googleId) {
          // Existing local user — link Google account
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: profile.id,
              authProvider: 'google',
              emailVerified: true,
              avatarUrl: user.avatarUrl ?? profile.photos?.[0]?.value ?? null,
            },
          });
          logger.info(`[Auth] Linked Google to existing user: ${email}`);
        }

        return done(null, user);
      } catch (err) {
        logger.error('Google Strategy error:', err);
        return done(err as Error, undefined);
      }
    },
  ),
);

export default passport;
