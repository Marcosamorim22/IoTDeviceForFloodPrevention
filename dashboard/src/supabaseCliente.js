import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://hpwsbxzlanuxsnnlotgz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1heK_XHgMZrD5AtUcVUoaw_ISbcVSIL"; // essa é pública, pode ir no frontend

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);