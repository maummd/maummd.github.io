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
shutil.copytree('/home/claude/maummd-maum-purchase/web/lib',f'{H}/purchase/lib',dirs_exist_ok=True)  # purchase/lib: 주문표 읽는 도구
cards=''.join(f'<a class="app" href="{k}/"><img src="{k}/icon-192.png" alt=""><div><b>{name}</b><span>{desc}</span></div></a>' for k,name,short,src,color,desc in apps)
open(f'{H}/index.html','w').write(f'''<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>maumm.org 앱</title><link rel="icon" href="maummd/icon-192.png">
<style>body{{margin:0;font-family:'Noto Sans KR','Apple SD Gothic Neo',system-ui,sans-serif;background:#F4F5F1;color:#22302C}}.w{{max-width:560px;margin:0 auto;padding:28px 16px}}h1{{font-size:22px;margin:0 0 4px}}p{{color:#66726D;margin:0 0 18px;font-size:14px}}
.app{{display:flex;gap:14px;align-items:center;background:#fff;border:1px solid #E0E4DE;border-radius:16px;padding:14px;margin-bottom:10px;text-decoration:none;color:inherit}}.app img{{width:56px;height:56px;border-radius:14px}}.app b{{display:block;font-size:16px}}.app span{{font-size:13px;color:#66726D}}
.tip{{font-size:12.5px;color:#66726D;background:#fff;border-radius:12px;padding:12px;margin-top:16px;line-height:1.6}}</style></head><body><div class="w">
<h1>maumm.org 앱</h1><p>설치 없이 휴대폰 · 아이폰 · PC에서 바로 써요.</p>{cards}
<div class="tip">📲 <b>홈 화면에 추가</b> — 안드로이드 크롬: 메뉴(⋮) → 홈 화면에 추가 · 아이폰 사파리: 공유 → 홈 화면에 추가 · PC 크롬: 주소창 오른쪽 설치 아이콘</div></div></body></html>''')
print('ok')

# ================= 안드로이드 앱 내려받기 =================
import qrcode
D=f'{H}/download';os.makedirs(D,exist_ok=True)
REL='https://github.com/maummd/{}/releases/download/latest/{}'
dl=[('purchase','물품 구매 관리',REL.format('maummd-maum-purchase','maumpurchase-release.apk'),'직원 수요조사 · 결재 라인 · 쿠팡 결제 · 구매 알림'),
    ('nurse-united','Nurse United','https://maummd.github.io/download/nurseunited.apk','수간호사 인사평가 · 성장 컨설팅 (Firebase 로그인)'),
    ('maummd','마음엠디',REL.format('maummd-app','maummd-release.apk'),'CBT 가족치료 프로그램 관리'),
    ('pingpong','마음비타민 탁구','https://maummd.github.io/download/pingpong.apk','탁구교실 출석 · 심사 · 리그 · 스탯'),
    ('diary','나의 마음 다이어리',REL.format('com.maumm.diary','maumdiary-release.apk'),'마음 날씨 · 마음 플레이리스트 · 마음 탐정')]
for k,name,url,desc in dl:
  qrcode.make(url,box_size=6,border=2).save(f'{D}/qr-{k}.png')
rows=''.join(f'''<div class="app"><img src="../{k}/icon-192.png" alt=""><div class="t"><b>{name}</b><span>{desc}</span>
<div class="btns"><a class="b" href="{url}">📥 앱 받기 (APK)</a><a class="b g" href="../{k}/">🌐 웹으로 열기</a></div></div><img class="qr" src="qr-{k}.png" alt="{name} 앱 받기 QR"></div>''' for k,name,url,desc in dl)
page=f'''<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>maumm.org 앱 내려받기</title><link rel="icon" href="../maummd/icon-192.png">
<style>body{{margin:0;font-family:'Noto Sans KR','Apple SD Gothic Neo',system-ui,sans-serif;background:#F4F5F1;color:#1B2623;font-size:16px;line-height:1.6}}.w{{max-width:680px;margin:0 auto;padding:26px 16px 40px}}h1{{font-size:24px;margin:0 0 4px}}h2{{font-size:18px;margin:24px 0 8px}}p{{color:#4E5B56;margin:0 0 14px}}
.app{{display:flex;gap:14px;align-items:center;background:#fff;border:1px solid #D9DED7;border-radius:16px;padding:14px;margin-bottom:12px}}.app>img{{width:60px;height:60px;border-radius:14px;flex:none}}.t{{flex:1;min-width:0}}.t b{{display:block;font-size:18px}}.t span{{font-size:14px;color:#4E5B56}}
.btns{{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}}.b{{background:#2F5D50;color:#fff;text-decoration:none;border-radius:12px;padding:9px 14px;font-weight:700;font-size:15px}}.b.g{{background:#E6F0EC;color:#2F5D50}}
.qr{{width:96px;height:96px;flex:none}}@media(max-width:520px){{.qr{{display:none}}}}
ol{{padding-left:20px;margin:6px 0}}li{{margin-bottom:6px}}.box{{background:#fff;border:1px solid #D9DED7;border-radius:16px;padding:14px 16px;font-size:15px}}
.top a{{color:#2F5D50;font-weight:700;text-decoration:none}}</style></head><body><div class="w">
<p class="top"><a href="../">← 웹 앱 모음</a></p>
<h1>📲 maumm.org 앱 내려받기</h1><p>안드로이드 휴대폰에 설치하는 앱이에요. 아이폰 · PC는 ‘웹으로 열기’를 써 주세요. PC 화면에서는 QR 코드를 휴대폰 카메라로 찍으면 바로 받아져요.</p>
{rows}
<h2>설치 방법 (안드로이드)</h2><div class="box"><ol>
<li>‘앱 받기’를 누르면 파일(.apk)을 내려받아요. “유해한 파일일 수도 있음”이 뜨면 <b>무시하고 다운로드</b>를 눌러요.</li>
<li>받은 파일을 누르고 <b>설치</b>를 눌러요. 처음이면 “출처를 알 수 없는 앱” 설정에서 <b>이 출처 허용</b>을 켜 주세요.</li>
<li>“앱 설치가 권장되지 않음”이 뜨면 <b>무시하고 설치</b>를 눌러요. Google Play 프로텍트가 검사한 뒤 설치돼요.</li>
<li>새 버전도 같은 링크에서 받아 덮어 설치하면 돼요. 기록은 그대로 남아요.</li></ol>
<p style="margin:8px 0 0">설치가 번거로우면 <b>웹으로 열기</b> → 홈 화면에 추가로 써도 같은 기능을 써요. (구매 시기 알림은 설치한 앱에서만 떠요)</p></div>
<p style="margin-top:18px;font-size:13px">maumm.org</p></div></body></html>'''
open(f'{D}/index.html','w').write(page)
# 첫 화면에 내려받기 안내 추가
idx=open(f'{H}/index.html').read()
idx=idx.replace('<div class="tip">','<a class="app" href="download/" style="border-color:#2F5D50"><img src="purchase/icon-192.png" alt="" style="visibility:hidden;width:0"><div><b>📲 안드로이드 앱 내려받기</b><span>설치용 파일(APK) 모음 · QR 코드</span></div></a>\n<div class="tip">',1)
open(f'{H}/index.html','w').write(idx)
print('download ok')
