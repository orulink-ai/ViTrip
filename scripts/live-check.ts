/** Explicit paid integration check. Reads credentials from stdin; never logs them. */
import {app,BrowserWindow} from 'electron';
import http from 'node:http';
import readline from 'node:readline';
import fs from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Browser} from '../src/main/browser';
import {runTravelAgent} from '../src/main/agent';
import {computerUse} from '../src/main/jev';
import {RunControl} from '../src/main/control';
import {planSchema,toolsSchema,type ToolName} from '../src/shared/schemas';
import type {Settings,Plan} from '../src/shared/types';
const directory=mkdtempSync(path.join(os.tmpdir(),'vitrip-live-'));
app.setPath('userData',directory);
void app.whenReady().then(async()=>{
const input=readline.createInterface({input:process.stdin});
const line=await new Promise<string>(resolve=>input.once('line',resolve));input.close();
const keys=JSON.parse(line);
const settings:Settings={baseURL:'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',model:'deepseek-v4.1-flash',apiKey:keys.bailian,jevApiKey:keys.jev};
const server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<!doctype html><html><title>旅行搜索联调</title><h1>本地旅行搜索测试</h1><label>目的地<input aria-label="目的地"></label><button type="button" onclick="document.querySelector('p').textContent='搜索结果：'+document.querySelector('input').value+'，示例景点：西湖。仅为测试数据。'">搜索</button><p>尚未搜索</p></html>`);});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();if(!address||typeof address==='string')throw new Error('address');
const url=`http://127.0.0.1:${address.port}`;
const win=new BrowserWindow({width:1000,height:720,show:true,title:'ViTrip · 模型联调'});
const browser=new Browser(()=>{},()=>{});win.contentView.addChildView(browser.view);browser.bounds({x:0,y:0,width:1000,height:720,visible:true});
const control=new RunControl();control.resume();
let plan:Plan|null=null;const called:string[]=[];
const signal=AbortSignal.timeout(180000);
const approve=async()=>{throw new Error('Live check does not approve external submissions');};
async function execute(name:ToolName,args:Record<string,unknown>):Promise<string>{
 called.push(name);console.log('tool:',name);
 switch(name){
 case 'navigate':return browser.navigate(toolsSchema.navigate.parse(args).url);
 case 'observe':return browser.observe();
 case 'click':return browser.click(toolsSchema.click.parse(args).ref,approve);
 case 'type':{const a=toolsSchema.type.parse(args);return browser.type(a.ref,a.text);}
 case 'scroll':return browser.scroll(toolsSchema.scroll.parse(args).direction);
 case 'press':return browser.press(toolsSchema.press.parse(args).key,approve);
 case 'plan':plan=planSchema.parse(args);return '行程已保存';
 case 'journal':toolsSchema.journal.parse(args);return '本联调只验证浏览器与 plan，journal 参数已验证。';
 case 'computer_use':return computerUse({goal:toolsSchema.computer_use.parse(args).goal,settings,signal,observe:()=>browser.observe(),assertFresh:()=>browser.assertFresh(),execute,onStatus:s=>console.log(s)});
 }
}
try{
 await runTravelAgent({settings,sessionDir:path.join(directory,'session'),control,signal,execute,onDelta:()=>{},onStatus:()=>{},onText:()=>{},prompt:`这是受控功能联调，不是真实预订。打开 ${url}，必须委托 computer_use 在网页里输入目的地杭州并点击搜索，读取实际结果。根据页面测试信息生成一日示例行程到 plan，明确标记测试数据、不是真实报价。无需询问偏好。`});
 const state=JSON.parse(await browser.observe());
 if(!state.text.includes('搜索结果：杭州')||!plan||!called.includes('computer_use'))throw new Error('Live workflow outcome failed');
 console.log(JSON.stringify({pi:'passed',bailian:'passed',jevBrowser:'passed',plan:'passed',tools:called}));
}catch(error){let message=error instanceof Error?error.message:'failed';for(const key of [settings.apiKey,settings.jevApiKey])if(key)message=message.replaceAll(key,'[REDACTED]');console.log('LIVE CHECK FAILED: '+message);process.exitCode=1;}
finally{browser.destroy();win.destroy();server.close();await fs.rm(directory,{recursive:true,force:true});app.quit();}

});
