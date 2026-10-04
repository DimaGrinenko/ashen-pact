import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { english, resolveLanguage, setLanguage, SocialModeContext, translate, translateError, useTranslation } from './i18n';
import { initialState, spin } from './engine';
import { BOOK_SCHEMA } from './rgs';
import { RgsSessionController } from './useRgsSession';

test('all launches default to English and explicit supported language selection is respected',()=>{
  for(const [query,expected] of [['','en'],['ui=paperclip-v5','en'],['lang=ru','ru'],['lang=en','en'],['lang=de','en'],['lang=','en'],['sessionID=x&rgs_url=rgs.test','en'],['replay=true','en'],['sessionId=bad','en'],['sessionID=x&rgs_url=rgs.test&lang=ru','ru']] as const)assert.equal(resolveLanguage(`https://game.test/?${query}`),expected,query);
});
test('messages interpolate and translate after their language changes, including Russian line plurals',()=>{
  const params={amount:'15.00',lines:11,ritual:true};
  assert.equal(translate('en','spin-win',params),'Win 15.00 · 11 lines · ritual');
  assert.equal(translate('ru','spin-win',params),'Выигрыш 15.00 · 11 линий · ритуал');
  assert.equal(translate('ru','spin-win',{...params,lines:1,ritual:false}),'Выигрыш 15.00 · 1 линия');
  assert.equal(translate('ru','spin-win',{...params,lines:4,ritual:false}),'Выигрыш 15.00 · 4 линии');
  assert.equal(translate('en','РИТУАЛ {tier}',{tier:3}),'RITUAL 3');
  assert.equal(translate('en','СЛЕДУЮЩЕЕ ВРАЩЕНИЕ · {amount}',{amount:'1.00 GC'},true),'NEXT SPIN · 1.00 GC');
});
test('Social Mode always uses English and excludes bet and buy terminology without changing parameter values',()=>{
  for(const key of ['СТАВКА','Увеличить ставку','КУПИТЬ','Покупка бонусов и усиления','16 666× ставки','Недостаточно средств. Уменьшите ставку или отключите усиление.'])assert.doesNotMatch(translate('en',key,{},true),/\b(bet|bets|buy|funds|purchase)\b/i,key);
  assert.equal(resolveLanguage('https://game.test/?lang=ru&social=true'),'en');
  assert.equal(translate('ru','СТАВКА',{},true),'PLAY AMOUNT');
  assert.equal(translate('ru','Недостаточно средств',{},true),'Insufficient balance');
  assert.equal(translate('ru','spin-win',{amount:'1.00 GC',lines:2},true),'Win 1.00 GC · 2 lines');
  assert.equal(translateError('Insufficient balance','ru',true),'Insufficient balance');
});
test('known session errors are localized and unknown validation details stay behind a friendly recovery message',()=>{
  assert.equal(translateError('Insufficient balance','ru'),'Недостаточно средств');
  assert.match(translateError('Дождитесь завершения текущей операции','en'),/^Wait for/);
  assert.match(translateError('Invalid RGS endpoint','en'),/^Invalid launch link/);
  assert.doesNotMatch(translateError('Unexpected confidential payload: abc123','en'),/abc123/);
  assert.match(translateError('Unconfirmed transaction. Reconnect to recover; do not repeat the play.','en'),/do not repeat/);
});

test('nested dialogs inherit English and social terminology from the authenticated session context',()=>{
  const Dialog=()=>{
    const {language,t}=useTranslation();
    return createElement('p',{'lang':language},t('СТАВКА'));
  };
  setLanguage('ru');
  try {
    assert.equal(renderToStaticMarkup(createElement(Dialog)), '<p lang="ru">СТАВКА</p>');
    assert.equal(renderToStaticMarkup(createElement(SocialModeContext.Provider,{value:true},createElement(Dialog))), '<p lang="en">PLAY AMOUNT</p>');
  } finally { setLanguage('en'); }
});
test('all Russian literals passed to t in game panels and controls have an English dictionary entry',()=>{
  const missing=new Set<string>();
  for(const file of ['AshenGame.tsx','GameControls.tsx']){
  const path=new URL(`./${file}`,import.meta.url),source=ts.createSourceFile(file,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const inspect=(node:ts.Node)=>{if(ts.isStringLiteral(node)&&/[А-Яа-яЁё]/.test(node.text)){
    for(let p:ts.Node|undefined=node.parent;p;p=p.parent)if(ts.isCallExpression(p)&&p.expression.getText(source)==='t'){if(!english[node.text])missing.add(node.text);break;}
  }ts.forEachChild(node,inspect);};inspect(source);
  }
  assert.deepEqual([...missing],[]);
});
test('minimal public replay forwards reference display flags and remains read-only through playback and restart',async()=>{
  const game=spin(initialState({betCents:100}),{preset:'line-win'}),result=game.lastSpin!;
  const state=[{index:0,type:'ashenBook',schema:BOOK_SCHEMA,mode:'base',betCents:100},{index:1,type:'ashenSpin',result,bonus:game.bonus},{index:2,type:'ashenTotal',payoutMultiplier:result.totalWinCents}];
  const calls:string[]=[];
  const controller=new RgsSessionController('https://game.test/?replay=true&game=ashen&version=1&mode=base&event=1&rgs_url=rgs.test',{request:async(input,init)=>{
    calls.push(String(input));assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);
    return new Response(JSON.stringify({costMultiplier:1,payoutMultiplier:result.totalWinCents/100,state}),{status:200,headers:{'content-type':'application/json'}});
  }});
  await controller.initialize();
  assert.equal(controller.getSnapshot().readOnly,true);
  assert.deepEqual(controller.getSnapshot().replayInfo?.displayDefaults,{amount:true,currency:true});
  await controller.advance({amountCents:100,presenter:async()=>{}});
  assert.equal(controller.getSnapshot().replayInfo?.completed,true);
  controller.restartReplay();
  assert.deepEqual(controller.getSnapshot().replayInfo?.displayDefaults,{amount:true,currency:true});
  assert.equal(calls.length,1);assert.doesNotMatch(calls[0],/wallet/);
});
