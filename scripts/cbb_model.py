"""Pregame men's basketball estimates. All training updates follow completed games."""
from collections import defaultdict
from math import sqrt
from statistics import mean, NormalDist

BASE = 104.
PACE = 70.
FIELDS = ['points','rebounds','assists','threes','turnovers','steals','blocks']
COMBOS = {'PRA':['points','rebounds','assists'],'PR':['points','rebounds'],
          'PA':['points','assists'],'RA':['rebounds','assists']}
MARKETS = FIELDS + list(COMBOS)


def clamp(x, low, high):
    return max(low,min(high,x))


def combine(values):
    return {**values, **{k:sum(values[f] for f in fields) for k,fields in COMBOS.items()}}


def factors(r, other):
    fga=max(1,r['field_goals_attempted'])
    return [(r['field_goals_made']+.5*r['three_point_field_goals_made'])/fga,
            r['total_turnovers']/max(1,fga+.475*r['free_throws_attempted']+r['total_turnovers']),
            r['offensive_rebounds']/max(1,r['offensive_rebounds']+other['defensive_rebounds']),
            r['free_throws_attempted']/fga]


class Teams:
    def __init__(self):
        self.state=defaultdict(lambda:[0.,0.,0.])
        self.home=defaultdict(lambda:[0.,0])
        self.court=3.
        self.last={}
        self.four=defaultdict(list)
        self.errors=[]
        self.check=[]
        self.weights=[0.]*5
        self.conference={}

    def rollover(self):
        # Returning teams share a schedule-strength prior with their previous conference.
        members=defaultdict(list)
        for tid,conf in self.conference.items():
            if self.four.get(tid):members[conf].append(self.state[tid])
        baseline={conf:[sum(r[i] for r in rows)/(len(rows)+3) for i in range(3)]
                  for conf,rows in members.items()}
        for tid,r in self.state.items():
            prior=baseline.get(self.conference.get(tid),[0.,0.,0.])
            # The conference prior informs strength (margin). Retain the team's own
            # scoring environment and pace when projecting the combined score.
            strength=.20*(prior[0]-prior[1])
            r[0]=.55*r[0]+strength
            r[1]=.55*r[1]-strength
            r[2]*=.55
        self.four.clear()
        self.last.clear()

    def forecast(self,g):
        h,a=g['home'],g['away']
        ho,hd,ht=self.state[h]
        ao,ad,at=self.state[a]
        residual,n=self.home[h]
        court=0 if g['neutral'] else self.court+residual/(30+n)
        pace=clamp(PACE+(ht+at)/2,52,90)
        hs=(BASE+ho+ad)*pace/100+court/2
        aws=(BASE+ao+hd)*pace/100-court/2
        # Fit the effects of rest and the four-factor interaction only on earlier games.
        for side,(t,o) in enumerate([(h,a),(a,h)]):
            features=self.context(g,t,o)
            effect=sum(w*x for w,x in zip(self.weights,features))
            if side==0:hs+=effect
            else:aws+=effect
        return hs,aws,pace,court

    def context(self,g,t,o):
        from datetime import date
        rest=lambda team:clamp((date.fromisoformat(g['time'][:10])-date.fromisoformat(self.last[team][:10])).days,1,7) if team in self.last else 4
        context=[(rest(t)-rest(o))/4]
        own,opp=self.four[t][-20:],self.four[o][-20:]
        for i,avg in enumerate((.5,.17,.30,.34)):
            a=mean(x[0][i] for x in own)-avg if own else 0
            d=mean(x[1][i] for x in opp)-avg if opp else 0
            context.append(clamp(a*d*100,-1,1))
        return context

    def update(self,g,h,a,periods,forecast,contexts):
        hs,aws,pace,court=forecast
        points=[h['team_score'],a['team_score']]
        possessions=mean(r['field_goals_attempted']+.475*r['free_throws_attempted']-
                         r['offensive_rebounds']+r['total_turnovers'] for r in [h,a])
        if possessions<35 or possessions>155:return
        reg=40/(40+5*max(0,periods-2))
        error=[points[0]-hs,points[1]-aws]
        self.errors.append(error)
        if g['season']==self.eval_year:
            prob=NormalDist().cdf((hs-aws)/12)
            self.check.append((abs(error[0]-error[1]),abs(sum(error)),(hs>aws)==(points[0]>points[1]),
                               (prob-int(points[0]>points[1]))**2))
        for i,(tid,opp,r,o,pred) in enumerate([(g['home'],g['away'],h,a,hs),(g['away'],g['home'],a,h,aws)]):
            venue=court/2 if i==0 else -court/2
            e=clamp((points[i]-venue)*100/possessions-(pred-venue)*100/pace,-45,45)
            for j,x in enumerate(contexts[i]):
                self.weights[j]=clamp(self.weights[j]*.9999+.003*x*clamp(error[i],-25,25),-4,4)
            self.state[tid][0]+=.075*e
            self.state[opp][1]+=.075*e
            self.state[tid][2]+=.13*(possessions*reg-pace)
            self.four[tid].append((factors(r,o),factors(o,r)))
            conf=g.get('homeConf' if i==0 else 'awayConf')
            if conf:self.conference[tid]=conf
            self.last[tid]=g['time']
        if not g['neutral']:
            delta=clamp(error[0]-error[1],-25,25)
            self.court+=.0005*delta
            self.home[g['home']][0]+=delta
            self.home[g['home']][1]+=1

    def profile(self,tid):
        o,d,t=self.state[tid]
        rows=self.four[tid][-25:]
        splits=[[round(100*mean(v[side][i] for v in rows),1) for i in range(4)]
                for side in (0,1)] if rows else [[],[]]
        return dict(adjO=round(BASE+o,1),adjD=round(BASE+d,1),adjT=round(PACE+t,1),
                    offense=splits[0],defense=splits[1],sample=len(rows))


def role(position,logs):
    if not logs:return position or 'Unclassified'
    minutes=max(1,sum(g['min'] for g in logs))
    per40=lambda key:40*sum(g[key] for g in logs)/minutes
    if per40('assists')>=4.5:return 'Primary creator'
    if per40('tpa')>=5 and per40('tpa')>=.40*per40('fga'):return 'Perimeter shooter'
    if position in ('C','F','PF') and per40('rebounds')>=8:return 'Interior rebounder'
    if per40('fta')>=4 and per40('fga')-per40('tpa')>=8:return 'Interior scorer'
    return {'G':'Guard','F':'Forward','C':'Center'}.get(position,position or 'Unclassified')


def allocate_minutes(weights):
    """Normalize a complete rotation to 200 minutes with a 40-minute cap."""
    left={p:w for p,w in weights.items() if w>0}
    if len(left)<5:return {}
    out={}
    remaining=200
    while left:
        total=sum(left.values())
        capped=[p for p,w in left.items() if remaining*w/total>40]
        if not capped:
            out.update({p:remaining*w/total for p,w in left.items()})
            break
        for p in capped:
            out[p]=40
            del left[p]
            remaining-=40
    return out


def samples(logs,venue):
    recent=logs[-15:]
    return [(g,(.90**i)*(1.35 if g['venue']==venue else 1)) for i,g in enumerate(reversed(recent))]


def rate(logs,k,venue):
    pairs=samples(logs,venue)
    return sum(g[k]*w for g,w in pairs)/max(1,sum(g['min']*w for g,w in pairs))


def outcomes(values,line):
    n=len(values)
    return {s:round((sum(test(v) for v in values)+(1 if s!='push' else 0))/(n+2),4) for s,test in
            [('over',lambda v:v>line),('under',lambda v:v<line),('push',lambda v:v==line)]}


def position_group(p):
    if p in ('PG','SG','G'):return 'Guard'
    if p in ('SF','PF','F'):return 'Forward'
    return 'Center' if p=='C' else 'Unclassified'


class Players:
    def __init__(self):
        self.logs=defaultdict(list)
        self.players={}
        self.appearances=defaultdict(list)
        self.allow=defaultdict(lambda:[0.,0.,0])
        self.last_team={}
        self.priors={}
        self.team_players=defaultdict(set)

    def ingest(self,game,rows,poss):
        for r in rows:
            tid=str(r['team_id'])
            pid=str(r['athlete_id'])
            if not r['athlete_id'] or not r['minutes'] or r['did_not_play']:continue
            seen=self.logs[pid]
            if seen and seen[-1]['game']==game['id']:continue
            venue='Neutral' if game['neutral'] else 'Home' if tid==game['home'] else 'Away'
            opp=game['away'] if tid==game['home'] else game['home']
            pos=r.get('athlete_position_abbreviation') or ''
            info={'id':pid,'name':r['athlete_display_name'],'team':tid,'pos':pos}
            group=role(pos,seen[-10:])
            stats={k:int(r.get('three_point_field_goals_made' if k=='threes' else k) or 0) for k in FIELDS}
            if len(seen)>=3:
                for k in FIELDS:
                    expected=rate(seen,k,venue)*r['minutes']*poss/PACE
                    for bucket in {group,'Position · '+position_group(pos)}:
                        agg=self.allow[opp,bucket,k]
                        agg[0]+=stats[k];agg[1]+=expected;agg[2]+=1
            self.team_players[tid].add(pid)
            self.players[pid]=info
            self.last_team[pid]=tid
            seen.append(dict(game=game['id'],date=game['time'][:10],venue=venue,opp=opp,team=tid,
                             pace=poss,min=r['minutes'],starter=bool(r['starter']),fga=r['field_goals_attempted'] or 0,
                             tpa=r['three_point_field_goals_attempted'] or 0,fta=r['free_throws_attempted'] or 0,
                             fouls=r['fouls'] or 0,fgm=r['field_goals_made'] or 0,ftm=r['free_throws_made'] or 0,
                             orb=r['offensive_rebounds'] or 0,drb=r['defensive_rebounds'] or 0,**stats))
        for t in [game['home'],game['away']]:self.appearances[t].append(game['id'])

    def project(self,tid,opp,venue,pace,margin,inactive,team_profile,opp_profile):
        team_games=self.appearances[tid][-6:]
        weights={}
        for pid in self.team_players[tid]:
            p=self.players[pid]
            if p['team']!=tid or pid in inactive:continue
            games={g['game']:g for g in self.logs[pid][-12:] if g['team']==tid}
            if not any(g in games for g in team_games[-3:]):continue
            seq=[games.get(g,{}).get('min',0) for g in team_games]
            weights[pid]=sum(m*.76**i for i,m in enumerate(reversed(seq)))/sum(.76**i for i in range(len(seq)))
        # Estimate blowout-minute sensitivity conservatively, then reallocate to reserves.
        blowout=clamp((abs(margin)-10)/35,0,.5)
        for pid in weights:
            weights[pid]*=1+blowout*(.15 if weights[pid]<17 else -.12)
        minutes=allocate_minutes(weights)
        out=[]
        for pid,m in minutes.items():
            logs=self.logs[pid];p=self.players[pid];group=role(p['pos'],logs[-10:])
            projected={};adj={};position={};draws=[]
            # Carry a returning player's per-minute skill across seasons; minutes use the current team only.
            prior=self.priors.get(pid,{})
            prior_weight=30/(30+sum(x['min'] for x in logs)) if prior else 0
            def blended(stat):
                return rate(logs,stat,venue)*(1-prior_weight)+prior.get(stat,0)*prior_weight
            fga,tpa,fta=[blended(v) for v in ('fga','tpa','fta')]
            two_trials=sum(g['fga']-g['tpa'] for g in logs)
            three_trials=sum(g['tpa'] for g in logs)
            ft_trials=sum(g['fta'] for g in logs)
            prior_two=prior.get('fga',0)-prior.get('tpa',0)
            prior_pct=lambda made,trials,avg:clamp(made/trials,.15,.95) if trials>0 else avg
            two_base=prior_pct(prior.get('fgm',0)-prior.get('threes',0),prior_two,.50)
            three_base=prior_pct(prior.get('threes',0),prior.get('tpa',0),.33)
            ft_base=prior_pct(prior.get('ftm',0),prior.get('fta',0),.70)
            two_pct=(sum(g['fgm']-g['threes'] for g in logs)+20*two_base)/(two_trials+20)
            three_pct=(sum(g['threes'] for g in logs)+25*three_base)/(three_trials+25)
            ft_pct=(sum(g['ftm'] for g in logs)+12*ft_base)/(ft_trials+12)
            rates={k:blended(k) for k in FIELDS}
            rates['threes']=tpa*three_pct
            rates['points']=2*max(0,fga-tpa)*two_pct+3*rates['threes']+fta*ft_pct
            if opp_profile['defense'] and team_profile['offense']:
                def_efg,def_to,def_orb,def_ft=opp_profile['defense']
                rates['points']*=clamp(1+(def_efg-50)/220+(def_ft-34)/650,.88,1.12)
                rates['assists']*=clamp(1+(def_efg-50)/200,.9,1.1)
                rates['turnovers']*=clamp(1+(def_to-17)/75,.85,1.15)
                opp_shoot=opp_profile['offense'][0]
                rates['rebounds']=blended('orb')*clamp(1+(def_orb-30)/100,.8,1.2)+blended('drb')*clamp(1-(opp_shoot-50)/100,.85,1.15)
            missing=[self.logs[x][-5:] for x in inactive if self.last_team.get(x)==tid]
            missing_fga=sum(mean(g['fga'] for g in batch) for batch in missing if batch)
            missing_ast=sum(mean(g['assists'] for g in batch) for batch in missing if batch)
            for stat in ('points','threes'):rates[stat]*=1+min(.12,missing_fga/150)
            if group=='Primary creator':rates['assists']*=1+min(.15,missing_ast/40)
            # Per-minute rates already include the pace of the player's recent games.
            sample_pace=mean(x['pace'] for x in logs[-15:])
            for k in FIELDS:
                obs,exp,n=self.allow[opp,group,k]
                baseline=clamp((obs+35)/(exp+35),.8,1.2)
                observed,expected,count=self.allow[opp,'Position · '+position_group(p['pos']),k]
                posratio=clamp((observed+50)/(expected+50),.8,1.2)
                adj[k]=[round(100*(baseline-1),1),n]
                position[k]=[round(100*(posratio-1),1),count]
                adj[k]+=[round(obs/n,1) if n else None,round(exp/n,1) if n else None]
                projected[k]=max(0,m*rates[k]*pace/max(45,sample_pace)*(.65*baseline+.35*posratio))
            # Keep all stats from a historical game together for combination-prop ranges.
            recent=logs[-15:]
            averages={k:mean(h[k] for h in recent) for k in FIELDS}
            scale=sqrt(m/max(5,mean(h['min'] for h in recent)))
            for g in recent:
                draws.append(combine({k:max(0,round(projected[k]+(g[k]-averages[k])*scale)) for k in FIELDS}))
            m_sorted=sorted(g['min'] for g in recent)
            out.append(dict(**p,role=group,minutes=round(m,1),venue=venue,
                            minuteRange=[m_sorted[len(recent)//5],m_sorted[min(len(recent)-1,4*len(recent)//5)]],
                            foulRate=round(40*blended('fouls'),1),starts=sum(g['starter'] for g in recent),
                            range={k:[sorted(d[k] for d in draws)[len(draws)//5],sorted(d[k] for d in draws)[min(len(draws)-1,4*len(draws)//5)]] for k in MARKETS},
                            estimate={k:round(v,1) for k,v in combine(projected).items()},
                            average={k:round(mean(combine(g)[k] for g in logs),1) for k in MARKETS},
                            adjustment=adj,positionEffect=position,sample=len(logs),draws=draws))
        return sorted(out,key=lambda p:-p['minutes'])
