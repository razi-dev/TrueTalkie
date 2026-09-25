// src/lib/supabase.ts
// Supabase client — replace with your actual URL and anon key from supabase.com

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yimanuyxzwmjpooqxvdu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BLFHX9KR3Ry4lfmIuoWsdQ_7LynlnZZ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
