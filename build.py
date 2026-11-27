import json,shutil,os,re
H='/home/claude/hub'
apps=[('purchase','물품 구매 관리','물품구매','/home/claude/maummd-maum-purchase/web/index.html','#2F5D50','구의연세정신건강의학과 물품 수요조사 · 결재 · 구매'),
 ('nurse-united','Nurse United','Nurse United','/home/claude/nurse-united/web/index.html','#1F4E79','수간호사 인사평가 · 성장 컨설팅'),
 ('maummd','마음엠디','마음엠디','/home/claude/maummd-app/web/index.html','#3A6894','CBT 가족치료 프로그램 관리'),
 ('pingpong','마음비타민 탁구','비타민탁구','/home/claude/maumvitamin-pingpong/web/index.html','#E67E22','탁구교실 훈련 · 리그 · 스탯'),
 ('diary','나의 마음 다이어리','마음다이어리','/home/claude/com.maumm.diary/web/index.html','#5B8C6E','마음 날씨 · 마음 플레이리스트')]
for k,name,short,src,color,desc in apps:
  s=open(src,encoding='utf-8').read()
  s=re.sub(r'<link rel="manifest"[^>]*>\s*|<link rel="(apple-touch-)?icon"[^>]*>\s*|<meta name="apple-mobile-web-app-capable"[^>]*>\s*','',s)
  inj=f'<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="{short}">\n'
  s=re.sub(r'(<head[^>]*>)',lambda m:m.group(1)+'\n'+inj,s,count=1)
  open(f'{H}/{k}/index.html','w',encoding='utf-8').write(s)
  json.dump({"name":name,"short_name":short,"start_url":"./","scope":"./","display":"standalone","background_color":"#F4F5F1","theme_color":color,"lang":"ko",
   "icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]},open(f'{H}/{k}/manifest.webmanifest','w'),ensure_ascii=False,indent=1)
shutil.copytree('/home/claude/nurse-united/web/vendor',f'{H}/nurse-united/vendor',dirs_exist_ok=True)
cards=''.join(f'<a class="app" href="{k}/"><img src="{k}/icon-192.png" alt=""><div><b>{name}</b><span>{desc}</span></div></a>' for k,name,short,src,color,desc in apps)
open(f'{H}/index.html','w').write(f'''<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>maumm.org 앱</title><link rel="icon" href="maummd/icon-192.png">
<style>body{{margin:0;font-family:'Noto Sans KR','Apple SD Gothic Neo',system-ui,sans-serif;background:#F4F5F1;color:#22302C}}.w{{max-width:560px;margin:0 auto;padding:28px 16px}}h1{{font-size:22px;margin:0 0 4px}}p{{color:#66726D;margin:0 0 18px;font-size:14px}}
.app{{display:flex;gap:14px;align-items:center;background:#fff;border:1px solid #E0E4DE;border-radius:16px;padding:14px;margin-bottom:10px;text-decoration:none;color:inherit}}.app img{{width:56px;height:56px;border-radius:14px}}.app b{{display:block;font-size:16px}}.app span{{font-size:13px;color:#66726D}}
.tip{{font-size:12.5px;color:#66726D;background:#fff;border-radius:12px;padding:12px;margin-top:16px;line-height:1.6}}</style></head><body><div class="w">
<h1>maumm.org 앱</h1><p>설치 없이 휴대폰 · 아이폰 · PC에서 바로 써요.</p>{cards}
<div class="tip">📲 <b>홈 화면에 추가</b> — 안드로이드 크롬: 메뉴(⋮) → 홈 화면에 추가 · 아이폰 사파리: 공유 → 홈 화면에 추가 · PC 크롬: 주소창 오른쪽 설치 아이콘</div></div></body></html>''')
print('ok')
