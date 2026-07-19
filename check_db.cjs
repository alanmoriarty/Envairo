const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const code = fs.readFileSync('./src/lib/supabase.js', 'utf8');
const urlMatch = code.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
const keyMatch = code.match(/supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/);
const supabase = createClient(urlMatch[1], keyMatch[1]);
supabase.from('sessions').select('*').limit(1).then(({data, error}) => console.log(error || Object.keys(data[0] || {})));
