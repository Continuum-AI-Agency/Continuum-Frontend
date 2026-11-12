import admin from '../../messages/admin/en.json';
import auth from '../../messages/auth/en.json';
import automations from '../../messages/automations/en.json';
import common from '../../messages/common/en.json';
import competitor from '../../messages/competitor/en.json';
import dashboard from '../../messages/dashboard/en.json';
import forge from '../../messages/forge/en.json';
import library from '../../messages/library/en.json';
import navigation from '../../messages/navigation/en.json';
import onboarding from '../../messages/onboarding/en.json';
import organic from '../../messages/organic/en.json';
import publicMessages from '../../messages/public/en.json';
import scale from '../../messages/scale/en.json';
import settings from '../../messages/settings/en.json';
import studio from '../../messages/studio/en.json';
import type { UiLocale } from './config';

declare module 'next-intl' {
  interface AppConfig {
    Locale: UiLocale;
    Messages: {
      common: typeof common;
      navigation: typeof navigation;
      auth: typeof auth;
      settings: typeof settings;
      onboarding: typeof onboarding;
      organic: typeof organic;
      scale: typeof scale;
      library: typeof library;
      forge: typeof forge;
      studio: typeof studio;
      automations: typeof automations;
      admin: typeof admin;
      dashboard: typeof dashboard;
      public: typeof publicMessages;
      competitor: typeof competitor;
    };
  }
}
