"""stimuli-v2 video: schematic but faithful RENDER of the real course of each task (state machines following the task
logic of the exercise: lights sequence, card flips, picture presentation, taps), 256x256, 10 fps, 40 s, silent.
Pictures from es/web/public/pictures/*.jpg are the real task pictures; icons are drawn with PIL (not the app's final art).
Run with the tribe venv: .venv-mac/bin/python mac/v2/make_video.py [ids]"""
import json, sys, random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio.v2 as iio
ROOT = Path("./tribe"); V = ROOT/"stimuli-v2"/"video"; V.mkdir(parents=True, exist_ok=True)
PIC = Path("./web/public/pictures")
W, FPS, DUR = 256, 10, 40
F = ImageFont.load_default(size=13); FS = ImageFont.load_default(size=10); FB = ImageFont.load_default(size=26)
BG=(247,243,235); INK=(40,40,50); BLUE=(60,100,200); GREEN=(60,160,90); RED=(210,60,60); YEL=(235,180,40); GREY=(205,205,205); ORG=(240,140,40)
PICS = {p.stem: Image.open(p).convert("RGB") for p in PIC.glob("*.jpg")}
def icon(d, name, cx, cy, s):
    r = s/2
    if name == "apple": d.ellipse([cx-r,cy-r*.8,cx+r,cy+r],fill=RED); d.line([cx,cy-r*.8,cx+3,cy-r],fill=(90,60,30),width=3)
    elif name == "banana": d.arc([cx-r,cy-r,cx+r,cy+r],20,160,fill=YEL,width=int(s/4))
    elif name == "pear": d.ellipse([cx-r*.5,cy-r,cx+r*.5,cy],fill=(150,190,60)); d.ellipse([cx-r*.8,cy-r*.3,cx+r*.8,cy+r],fill=(150,190,60))
    elif name == "cup": d.rectangle([cx-r*.6,cy-r*.5,cx+r*.5,cy+r*.7],fill=BLUE); d.arc([cx+r*.2,cy-r*.3,cx+r*.9,cy+r*.4],270,90,fill=BLUE,width=3)
    elif name == "tree": d.rectangle([cx-3,cy,cx+3,cy+r],fill=(110,70,30)); d.ellipse([cx-r*.8,cy-r,cx+r*.8,cy+r*.3],fill=GREEN)
    elif name == "bus": d.rectangle([cx-r,cy-r*.5,cx+r,cy+r*.5],fill=YEL); [d.rectangle([cx-r*.8+i*r*.55,cy-r*.3,cx-r*.4+i*r*.55,cy],fill=(200,230,250)) for i in range(3)]; d.ellipse([cx-r*.7,cy+r*.3,cx-r*.3,cy+r*.7],fill=INK); d.ellipse([cx+r*.3,cy+r*.3,cx+r*.7,cy+r*.7],fill=INK)
    elif name == "key": d.ellipse([cx-r,cy-r*.3,cx-r*.2,cy+r*.3],outline=YEL,width=4); d.line([cx-r*.2,cy,cx+r,cy],fill=YEL,width=4); d.line([cx+r*.6,cy,cx+r*.6,cy+r*.4],fill=YEL,width=4)
    elif name == "bread": d.rounded_rectangle([cx-r,cy-r*.4,cx+r,cy+r*.5],radius=int(r*.5),fill=(200,150,80))
    elif name == "lamp": d.polygon([(cx-r*.7,cy),(cx+r*.7,cy),(cx+r*.3,cy-r),(cx-r*.3,cy-r)],fill=YEL); d.rectangle([cx-2,cy,cx+2,cy+r*.8],fill=INK); d.rectangle([cx-r*.5,cy+r*.8,cx+r*.5,cy+r],fill=INK)
    elif name == "bird": d.ellipse([cx-r*.7,cy-r*.4,cx+r*.5,cy+r*.5],fill=BLUE); d.polygon([(cx+r*.5,cy-r*.1),(cx+r,cy),(cx+r*.5,cy+r*.1)],fill=ORG)
    elif name == "house": d.rectangle([cx-r*.7,cy-r*.2,cx+r*.7,cy+r*.8],fill=(220,190,150)); d.polygon([(cx-r*.9,cy-r*.2),(cx+r*.9,cy-r*.2),(cx,cy-r)],fill=RED)
    elif name == "clock": d.ellipse([cx-r,cy-r,cx+r,cy+r],outline=INK,width=3,fill=(255,255,255)); d.line([cx,cy,cx,cy-r*.6],fill=INK,width=3); d.line([cx,cy,cx+r*.4,cy],fill=INK,width=3)
    elif name == "hammer": d.rectangle([cx-3,cy-r*.3,cx+3,cy+r],fill=(110,70,30)); d.rectangle([cx-r*.7,cy-r*.8,cx+r*.7,cy-r*.3],fill=(120,120,130))
    elif name == "milk": d.rectangle([cx-r*.5,cy-r*.6,cx+r*.5,cy+r],fill=(240,240,250),outline=BLUE,width=2); d.polygon([(cx-r*.5,cy-r*.6),(cx,cy-r),(cx+r*.5,cy-r*.6)],fill=BLUE)
    elif name == "fish": d.ellipse([cx-r,cy-r*.4,cx+r*.5,cy+r*.4],fill=ORG); d.polygon([(cx+r*.5,cy),(cx+r,cy-r*.4),(cx+r,cy+r*.4)],fill=ORG)
    elif name == "dog": d.ellipse([cx-r*.8,cy-r*.3,cx+r*.5,cy+r*.5],fill=(150,100,60)); d.ellipse([cx+r*.2,cy-r*.8,cx+r*.9,cy-r*.1],fill=(150,100,60))
    else: d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=GREY)
def face(d, cx, cy, k):
    skin=[(240,200,170),(200,150,110),(250,220,190),(160,110,80)][k%4]; hair=[(60,40,30),(200,170,60),(30,30,30),(150,60,40)][k%4]
    d.ellipse([cx-40,cy-48,cx+40,cy+48],fill=hair); d.ellipse([cx-34,cy-38,cx+34,cy+44],fill=skin)
    d.ellipse([cx-18,cy-10,cx-9,cy+0],fill=INK); d.ellipse([cx+9,cy-10,cx+18,cy+0],fill=INK); d.arc([cx-16,cy+10,cx+16,cy+30],10,170,fill=INK,width=3)
def base(title, prog=None):
    im = Image.new("RGB",(W,W),BG); d = ImageDraw.Draw(im); d.rectangle([0,0,W,24],fill=(230,224,212)); d.text((8,5),title,fill=INK,font=F)
    if prog is not None: d.rectangle([0,22,int(W*prog),25],fill=BLUE)
    return im, d
def btn(d, box, label, on=False, col=BLUE):
    d.rounded_rectangle(box,radius=8,fill=col if on else (255,255,255),outline=col,width=2); d.text(((box[0]+box[2])/2,(box[1]+box[3])/2),label,fill=(255,255,255) if on else col,font=F,anchor="mm")
def finger(d, x, y, t_on):
    if t_on: d.ellipse([x-14,y-14,x+14,y+14],outline=ORG,width=3); d.ellipse([x-4,y-4,x+4,y+4],fill=ORG)
def grid_cells(n, x0=28, y0=44, size=200):
    s = size//n; return [(x0+(i%n)*s+s//2, y0+(i//n)*s+s//2, s-10) for i in range(n*n)]
rng = random.Random(7)
def seq_schedule(lengths, show=0.8, gap=0.4, tap=0.9, n=9):
    """list of (t0,t1,phase,cell): phase show/tap; sequences grow like the real task"""
    ev=[]; t=1.0
    for L in lengths:
        seq=[rng.randrange(n) for _ in range(L)]
        for c in seq: ev.append((t,t+show,"show",c)); t+=show+gap
        t+=0.8
        for c in seq: ev.append((t,t+0.35,"tap",c)); t+=tap
        ev.append((t,t+1.2,"ok",-1)); t+=1.6
    return ev
def r_spatial(t, ex):
    ev = SCH.setdefault(ex, seq_schedule([3,3,4,4,5]))
    im,d = base("Watch the order, then repeat", t/DUR); cells = grid_cells(3)
    cur = next(((p,c) for a,b,p,c in ev if a<=t<b), None); fx = None
    for i,(cx,cy,s) in enumerate(cells):
        col = GREY
        if cur and cur[1]==i: col = BLUE if cur[0]=="show" else ORG
        d.rounded_rectangle([cx-s/2,cy-s/2,cx+s/2,cy+s/2],radius=10,fill=col)
        if cur and cur[0]=="tap" and cur[1]==i: finger(d,cx,cy,True)
    if cur and cur[0]=="ok": d.text((128,236),"Correct!",fill=GREEN,font=F,anchor="mm")
    elif cur is None and any(b<=t for a,b,p,c in ev): pass
    return im
SCH = {}
def r_digit(t, ex):
    im,d = base("Remember the digits",t/DUR)
    if "dg" not in SCH: SCH["dg"]=[(rng.sample(range(1,10),L)) for L in (3,4,5)]
    tt=1.0
    for seq in SCH["dg"]:
        for k,dg in enumerate(seq):
            if tt<=t<tt+0.9: d.text((128,120),str(dg),fill=INK,font=ImageFont.load_default(size=90),anchor="mm")
            tt+=1.2
        tt+=0.5; pad=[(60+(i%3)*70,70+(i//3)*55) for i in range(9)]
        # input phase: keypad with taps
        for k,dg in enumerate(seq):
            if tt<=t<tt+0.9:
                for i,(px,py) in enumerate(pad): btn(d,[px-28,py-22,px+28,py+22],str(i+1),on=(i+1==dg))
                finger(d,*pad[dg-1],True)
            tt+=1.0
        tt+=0.8
    if not im.getbbox() or False: pass
    return im
def r_pairs(t, ex):
    im,d = base("Find the pairs",t/DUR); names=["apple","cup","tree","bus","key","bread"]
    if "pr" not in SCH:
        deck=names*2; rng.shuffle(deck); order=[]; left=list(range(12)); matched=set(); tt=1.0; ev=[]
        for _ in range(14):  # attempts: some are matches
            avail=[i for i in range(12) if i not in matched]
            if len(avail)<2: break
            a=rng.choice(avail); mates=[i for i in avail if i!=a and deck[i]==deck[a]]
            b=mates[0] if (mates and rng.random()<0.45+0.04*len(ev)) else rng.choice([i for i in avail if i!=a])
            ev.append((tt,a,b,deck[a]==deck[b])); 
            if deck[a]==deck[b]: matched|={a,b}
            tt+=2.6
        SCH["pr"]=(deck,ev)
    deck,ev=SCH["pr"]
    matched=set(); up=set()
    for tt,a,b,ok in ev:
        if t>=tt+2.2 and ok: matched|={a,b}
        if tt<=t<tt+2.2: up|={a} if t<tt+0.8 else {a,b}
    for i in range(12):
        cx=34+(i%4)*62; cy=62+(i//4)*70; face_up = i in up or i in matched
        d.rounded_rectangle([cx-26,cy-30,cx+26,cy+30],radius=8,fill=(255,255,255) if face_up else (90,100,150),outline=GREEN if i in matched else INK,width=2)
        if face_up: icon(d,deck[i],cx,cy,34)
    return im
def r_odd(t, ex):
    im,d = base("Tap the odd one out",t/DUR)
    sets=[(["apple","banana","pear","hammer"],3),(["cup","bus","tree","key"],1),(["bird","fish","dog","lamp"],3),(["house","bread","milk","apple"],0),(["tree","lamp","clock","bird"],3),(["pear","apple","banana","key"],3)]
    k=int(t//6.6)%len(sets); lt=t%6.6; items,odd=sets[k]
    for i,nm in enumerate(items):
        cx=70+(i%2)*118; cy=80+(i//2)*100; sel = lt>3.5 and i==odd
        d.rounded_rectangle([cx-48,cy-42,cx+48,cy+42],radius=10,fill=(255,255,255),outline=GREEN if sel else GREY,width=4 if sel else 2); icon(d,nm,cx,cy,48)
        if lt>3 and lt<3.7 and i==odd: finger(d,cx,cy,True)
    return im
def r_spot(t, ex):
    im,d = base("Find 5 differences",t/DUR); a=PICS["bus-stop-rain"].resize((236,118)); b=a.copy(); bd=ImageDraw.Draw(b)
    spots=[(40,30),(110,80),(180,40),(70,95),(200,95)]
    for (x,y) in spots[:5]: bd.ellipse([x-9,y-9,x+9,y+9],fill=(250,250,250))
    im.paste(a,(10,34)); im.paste(b,(10,160-0)); found=0
    for i,(x,y) in enumerate(spots):
        tt=4+i*7
        if t>tt+0.6: found+=1; d.ellipse([10+x-14,160+y-14,10+x+14,160+y+14],outline=RED,width=3); d.ellipse([10+x-14,34+y-14,10+x+14,34+y+14],outline=RED,width=3)
        if tt<=t<tt+0.6: finger(d,10+x,160+y,True)
    d.text((248,5),f"{found}/5",fill=INK,font=F,anchor="ra"); return im
def r_sort(t, ex):
    im,d = base("Sort by the rule",t/DUR); rule = "COLOR" if (t%20)<12 or t<12 else "SHAPE"; rule="COLOR" if t<20 else "SHAPE"
    d.text((128,40),f"Rule: {rule}",fill=INK,font=F,anchor="mm")
    cols=[RED,BLUE,GREEN]; shapes=["c","s","t"]
    for i in range(3):
        x=40+i*80; d.rounded_rectangle([x-30,170,x+30,236],radius=8,outline=cols[i] if rule=="COLOR" else INK,width=3)
        if rule=="SHAPE": shp(d,shapes[i],x,203,14,INK)
    k=int(t//2.5); lt=t%2.5; c=k%3; s=(k*2+1)%3; tgt=c if rule=="COLOR" else s
    x0,y0=128,100; x1,y1=40+tgt*80,203; u=min(1,max(0,(lt-0.5)/1.2)); x=x0+(x1-x0)*u; y=y0+(y1-y0)*u
    shp(d,shapes[s],x,y,22,cols[c]); finger(d,x,y,lt>0.3 and lt<1.8); return im
def shp(d,s,x,y,r,col):
    if s=="c": d.ellipse([x-r,y-r,x+r,y+r],fill=col)
    elif s=="s": d.rectangle([x-r,y-r,x+r,y+r],fill=col)
    else: d.polygon([(x,y-r),(x-r,y+r),(x+r,y+r)],fill=col)
def r_react(t, ex):
    im,d = base("Tap the GREEN circle",t/DUR)
    if "rc" not in SCH:
        tt=1.0; ev=[]
        while tt<DUR-1: ev.append((tt,rng.random()<0.65,rng.randint(40,216),rng.randint(60,216),rng.uniform(0.55,0.75))); tt+=rng.uniform(1.4,2.6)
        SCH["rc"]=ev
    for tt,g,x,y,rt in SCH["rc"]:
        if tt<=t<tt+1.0:
            d.ellipse([x-26,y-26,x+26,y+26],fill=GREEN if g else RED)
            if g and t>=tt+rt: finger(d,x,y,True)
    return im
def r_cards(t, ex):
    im,d = base("Build the sentence",t/DUR); sents=[["The","dog","runs","fast"],["She","drinks","hot","tea","daily"],["We","walk","to","the","park"]]
    k=int(t//13)%3; lt=t%13; ws=sents[k]; order=[2,0,3,1,4][:len(ws)] if k!=1 else [3,0,4,2,1]
    for i in range(len(ws)): d.rounded_rectangle([14+i*46-(0),60,52+i*46,90],radius=5,outline=GREY,fill=(240,240,240))
    for j,wi in enumerate(range(len(ws))):
        tgt=(14+wi*46,60); st=(20+(order[j]%3)*70, 150+(order[j]//3)*45); tt=1+wi*2.2
        u=min(1,max(0,(lt-tt)/1.2)); x=st[0]+(tgt[0]-st[0])*u; y=st[1]+(tgt[1]-st[1])*u
        d.rounded_rectangle([x,y,x+40,y+30],radius=5,fill=BLUE); d.text((x+20,y+15),ws[wi],fill=(255,255,255),font=FS,anchor="mm")
        if 0<u<1: finger(d,x+20,y+15,True)
    btn(d,[80,215,176,245],"Done",on=lt>11); return im
def r_route(t, ex):
    im,d = base("Remember the route",t/DUR); pts=[(30,220),(30,150),(100,150),(100,90),(190,90),(190,40),(230,40)]
    for k in range(7): pass
    d.rectangle([10,34,246,246],fill=(235,240,225));
    for i in range(1,6): d.line([i*40,34,i*40,246],fill=(220,225,210)); d.line([10,34+i*35,246,34+i*35],fill=(220,225,210))
    icon(d,"house",30,225,22); d.text((222,52),"Shop",fill=INK,font=FS,anchor="mm")
    ph = 0 if t<2 else 1 if t<12 else 2 if t<17 else 3; draw=0
    if ph==1: draw=min(1,(t-2)/8)
    elif ph==0: draw=0
    elif ph==3: draw=min(1,(t-17)/ (DUR-18))
    if ph==2: d.rectangle([10,34,246,246],fill=(210,210,210)); d.text((128,140),"Map hidden",fill=INK,font=F,anchor="mm"); return im
    if ph in (1,3):
        L=[np.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]) for i in range(6)]; tot=sum(L)*draw; col=BLUE if ph==1 else ORG
        for i in range(6):
            seg=min(L[i],max(0,tot)); tot-=L[i]
            if seg>0: u=seg/L[i]; d.line([pts[i],(pts[i][0]+(pts[i+1][0]-pts[i][0])*u,pts[i][1]+(pts[i+1][1]-pts[i][1])*u)],fill=col,width=5)
    return im
def r_face(t, ex):
    im,d = base("Which name went with this face?",t/DUR); k=int(t//6.6)%6; lt=t%6.6; names=["Anna","Boris","Clara","Daniel"]; ans=k%4
    face(d,128,95,k); 
    for i,n in enumerate(names):
        bx=[12+(i%2)*122,170+(i//2)*40,122+(i%2)*122,200+(i//2)*40]; sel=lt>3.6 and i==ans; btn(d,bx,n,on=sel,col=GREEN if sel else BLUE)
        if lt>3 and lt<3.8 and i==ans: finger(d,(bx[0]+bx[2])/2,(bx[1]+bx[3])/2,True)
    return im
def r_shop(t, ex):
    items=["apple","bread","milk","banana","fish","pear"]; im,d = base("Remember the shopping list" if t<16 else "Tap the items on the list",t/DUR)
    if t<16:
        k=int(t//3.2); 
        d.rounded_rectangle([60,50,196,190],radius=12,fill=(255,255,255),outline=GREY,width=2); icon(d,items[min(k,4)],128,120,70)
        for j in range(k+1 if k<5 else 5): icon(d,items[j],26+j*50,225,28)
    else:
        lt=t-16; opts=["apple","hammer","bread","lamp","milk","banana","key","fish","tree"]
        for i,nm in enumerate(opts):
            cx=50+(i%3)*78; cy=70+(i//3)*62; inl=nm in items[:5]; sel = inl and lt>1+ [opts.index(x) for x in opts if x in items[:5]].index(i)*2.2 if inl else False
            d.rounded_rectangle([cx-32,cy-26,cx+32,cy+26],radius=8,fill=(255,255,255),outline=GREEN if sel else GREY,width=4 if sel else 2); icon(d,nm,cx,cy,34)
    return im
def r_delayed(t, ex):
    im,d = base("Was it in the set? Yes / No",t/DUR); seq=["bus-stop-rain","apple","backyard-wind","cup","tree","key"]; k=int(t//6.6)%6; lt=t%6.6; nm=seq[k]; old=k%2==0
    if nm in PICS: im.paste(PICS[nm].resize((220,147)),(18,50))
    else: d.rounded_rectangle([18,50,238,197],radius=10,fill=(255,255,255)); icon(d,nm,128,123,80)
    yes=old; btn(d,[20,208,120,242],"Yes",on=lt>3.8 and yes,col=GREEN); btn(d,[136,208,236,242],"No",on=lt>3.8 and not yes,col=RED)
    if 3<lt<3.9: finger(d,70 if yes else 186,225,True)
    return im
def r_pictures(t, ex):  # picture_description / picture_naming: the real pictures on screen
    im,d = base("Describe the picture" if ex=="picture_description" else "Name the object",t/DUR)
    if ex=="picture_description":
        nm="bus-stop-rain" if t<20 else "backyard-wind"; im.paste(PICS[nm].resize((240,160)),(8,50)); d.text((128,225),"Describe what you see",fill=INK,font=F,anchor="mm")
    else:
        names=["cup","tree","bus","key","bread","lamp","bird","house","apple"]; k=int(t//4.4)%9; d.rounded_rectangle([40,50,216,226],radius=12,fill=(255,255,255),outline=GREY,width=2); icon(d,names[k],128,138,100)
    return im
def r_wpm(t, ex):
    im,d = base("Choose the picture",t/DUR); names=["cup","tree","bus","key","bread","lamp","bird","house","clock","apple","dog"]; k=int(t//3.6); lt=t%3.6; ans=names[k%11]
    opts=[ans]+[n for n in rng.sample([x for x in names if x!=ans],3)] if ("wp%d"%k) not in SCH else SCH["wp%d"%k]; SCH["wp%d"%k]=opts
    order=sorted(opts,key=lambda s:hash((s,k))%7)
    for i,nm in enumerate(order):
        cx=66+(i%2)*124; cy=88+(i//2)*96; sel=nm==ans and lt>2.3
        d.rounded_rectangle([cx-52,cy-42,cx+52,cy+42],radius=10,fill=(255,255,255),outline=GREEN if sel else GREY,width=4 if sel else 2); icon(d,nm,cx,cy,50)
        if nm==ans and 1.8<lt<2.5: finger(d,cx,cy,True)
    return im
def r_s2p(t, ex):
    im,d = base("Which picture matches the sound?",t/DUR); k=int(t//7); lt=t%7; names=["bird","bus","dog","clock","lamp","fish"]
    d.ellipse([108-8*np.sin(lt*6)*(lt<2.5),46,148,86],outline=BLUE,width=3) if lt<2.5 else None; d.text((128,66),"((  ))" if lt<2.5 else "",fill=BLUE,font=F,anchor="mm")
    ans=k%3
    for i in range(3):
        nm=names[(k+i)%6]; cx=46+i*82; cy=150; sel=i==ans and lt>5
        d.rounded_rectangle([cx-36,cy-40,cx+36,cy+40],radius=10,fill=(255,255,255),outline=GREEN if sel else GREY,width=4 if sel else 2); icon(d,nm,cx,cy,44)
        if i==ans and 3.8<lt<5.2: finger(d,cx,cy,True)
    return im
def r_tone(t, ex):
    im,d = base("Listening: press when the beep is different",t/DUR); on=(t%1.2)<0.3; dev=int(t//1.2) in (7,17,26)
    d.ellipse([88,60,168,140],fill=(ORG if dev else BLUE) if on else GREY); btn(d,[78,185,178,230],"Press",on=on and dev,col=ORG)
    if on and dev and (t%1.2)>0.12: finger(d,128,207,True)
    return im
def r_rhythm(t, ex):
    im,d = base("Listen, then tap the same rhythm",t/DUR); pat=[0.5,0.5,1.0,0.5,1.0,0.5]; cyc=sum(pat)+1.2+0.0; 
    ct=t%(cyc*2+1); phase_listen=ct<cyc; ons=np.cumsum([0]+pat[:-1])
    on=False
    ph_t = ct if phase_listen else ct-cyc
    on = any(0<=ph_t-o<0.15 for o in ons)
    if phase_listen: d.ellipse([88,50,168,130],fill=BLUE if on else GREY); d.text((128,150),"Listen",fill=INK,font=F,anchor="mm")
    else: d.ellipse([88,50,168,130],fill=ORG if on else GREY); d.text((128,150),"Your turn",fill=INK,font=F,anchor="mm"); finger(d,128,90,on)
    return im
R={"spatial_sequence_recall":r_spatial,"digit_span_tap":r_digit,"picture_pair_memory":r_pairs,"odd_one_out":r_odd,"spot_the_difference":r_spot,
 "card_sorting":r_sort,"reaction_tap":r_react,"sentence_building_cards":r_cards,"route_recall_map":r_route,"face_name_choice":r_face,
 "shopping_list_recall_visual":r_shop,"delayed_picture_recognition":r_delayed,"picture_description":r_pictures,"picture_naming":r_pictures,
 "word_picture_matching":r_wpm,"sound_to_picture":r_s2p,"sustained_tone_detection":r_tone,"rhythm_copy":r_rhythm}
if __name__=="__main__":
    ids=sys.argv[1:] or list(R); man=json.load(open(ROOT/"stimuli-v2"/"manifest.json"))
    for ex in ids:
        w=iio.get_writer(str(V/f"{ex}.mp4"),fps=FPS,codec="libx264",macro_block_size=None,quality=7)
        for i in range(DUR*FPS): w.append_data(np.asarray(R[ex](i/FPS,ex)))
        w.close(); man[ex]["modalities"]=sorted(set(man[ex]["modalities"])|{"video"})
        man[ex]["video"]={"duration_s":DUR,"how":"PIL render of the real task course (task logic state machine), 256x256, 10 fps, silent"}; print(ex,flush=True)
    (ROOT/"stimuli-v2"/"manifest.json").write_text(json.dumps(man,ensure_ascii=False,indent=1))
