// Alleen lokale integratietest: echte PostgreSQL-functies, fictieve accounts en lokaal Realtime-verkeer.
// Nooit publiceren. Geen verzoek bereikt Supabase of een echt account.
// node tools/preview_live_rounds.cjs <pad-naar-@electric-sql/pglite> [poort]
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.argv[2]||'@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const port=Number(process.argv[3]||8768);
async function main(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select current_setting('request.jwt.claims',true)::jsonb$$;
    grant usage on schema auth to authenticated;`);
  await db.exec(fs.readFileSync(path.join(root,'supabase/live_rounds.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/live_rounds_puzzles.sql'),'utf8'));
  let queue=Promise.resolve();
  http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__test/rpc'&&req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>16384){res.writeHead(413).end();return;}}
      const task=queue.catch(()=>{}).then(async()=>{
        try {
          const {player,params}=JSON.parse(body);
          if(!Number.isInteger(player)||player<1||player>9)throw Error('INVALID_TEST_PLAYER');
          await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[
            `00000000-0000-4000-8000-${String(player).padStart(12,'0')}`,JSON.stringify({user_metadata:{username:'Tester '+player}})]);
          await db.exec('set role authenticated');
          const result=await db.query('select public.live_rounds($1,$2,$3::jsonb) as state',[params.p_action,params.p_code,JSON.stringify(params.p_options)]);
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:result.rows[0].state,error:null}));
        }catch(error){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{message:error.message}}));}
        finally {await db.exec('reset role');}
      });queue=task;await task;return;
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
    if(url.pathname==='/'||url.pathname.startsWith('/live-rounds'))file=path.join(root,'index.html');
    try{
      let content=fs.readFileSync(file);
      const ext=path.extname(file);
      if(ext==='.html')content=content.toString().replace('<head>','<head><base href="/">').replace('defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"','src="/tools/preview_live_rounds_client.js"');
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[ext]||'application/octet-stream');
      res.end(content);
    }catch(_){res.writeHead(404).end();}
  }).listen(port,'127.0.0.1',()=>console.log(`Uitsluitend testdata: http://127.0.0.1:${port}/live-rounds/?player=1 (tweede tab: player=2)`));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
