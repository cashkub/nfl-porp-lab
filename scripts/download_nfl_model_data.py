#!/usr/bin/env python3
"""Download public nflverse schedule and play-by-play inputs for walk-forward model evaluation."""
import argparse
import gzip
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

GAMES_URL='https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
PBP_URL='https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz'
USER_AGENT='NFL-Prop-Lab-Model-Validation/1.0 (https://github.com/cashkub/nfl-prop-lab)'


def current_nfl_season():
    now=datetime.now(timezone.utc)
    return now.year if now.month>=7 else now.year-1


def download(url,path,refresh=False):
    path=Path(path)
    if path.exists() and path.stat().st_size>0 and not refresh:
        print(f'Using cached {path.name} ({path.stat().st_size:,} bytes)')
        return
    request=urllib.request.Request(url,headers={'User-Agent':USER_AGENT,'Accept':'*/*'})
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.part')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request,timeout=120) as response, temp.open('wb') as output:
                while True:
                    chunk=response.read(1024*1024)
                    if not chunk:break
                    output.write(chunk)
            if temp.stat().st_size<100:
                raise ValueError(f'Download was unexpectedly small: {url}')
            os.replace(temp,path)
            print(f'Downloaded {path.name} ({path.stat().st_size:,} bytes)')
            return
        except urllib.error.HTTPError as exc:
            temp.unlink(missing_ok=True)
            if exc.code==404:
                raise RuntimeError(f'nflverse has no published data for this request: {url}') from exc
            if attempt==2:
                raise
        except (urllib.error.URLError,TimeoutError,ValueError) as exc:
            temp.unlink(missing_ok=True)
            if attempt==2:
                raise RuntimeError(f'Failed downloading {url}: {exc}') from exc
        time.sleep(2**attempt)


def validate_games(path):
    with Path(path).open(encoding='utf-8-sig') as source:
        header=source.readline().strip().split(',')
    required={'season','game_type','week','game_id','home_team','away_team','home_score','away_score','result'}
    missing=required-set(header)
    if missing:
        raise ValueError(f'nflverse schedule schema changed; missing columns: {sorted(missing)}')


def validate_pbp(path):
    with gzip.open(path,'rt',encoding='utf-8-sig') as source:
        header=source.readline().strip().split(',')
    required={'game_id','posteam','defteam','play_type','qb_dropback','epa','passer_player_id'}
    missing=required-set(header)
    if missing:
        raise ValueError(f'nflverse play-by-play schema changed; missing columns: {sorted(missing)}')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir',type=Path,default=Path('data/nfl-model'))
    parser.add_argument('--start-year',type=int,default=2019)
    parser.add_argument('--end-year',type=int,default=current_nfl_season())
    parser.add_argument('--refresh',action='store_true',help='Redownload cached files to pick up upstream corrections.')
    args=parser.parse_args()
    if args.start_year<1999 or args.end_year<args.start_year:
        parser.error('Choose a start year from 1999 onward and an end year no earlier than the start year.')
    args.output_dir.mkdir(parents=True,exist_ok=True)
    games=args.output_dir/'games.csv'
    download(GAMES_URL,games,args.refresh)
    validate_games(games)
    for year in range(args.start_year,args.end_year+1):
        path=args.output_dir/f'{year}.gz'
        download(PBP_URL.format(season=year),path,args.refresh)
        validate_pbp(path)
    print(f'Validated nflverse model inputs in {args.output_dir}')


if __name__=='__main__':
    try:
        main()
    except (OSError,RuntimeError,ValueError) as exc:
        print(str(exc),file=sys.stderr)
        raise SystemExit(1)
