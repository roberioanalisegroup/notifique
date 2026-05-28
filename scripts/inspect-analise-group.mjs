import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf8");
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || envContent.match(/SUPABASE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from("alvaras")
    .select("*")
    .eq("group_id", "949f366d-46d1-4897-a372-835975e13335");
  
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
