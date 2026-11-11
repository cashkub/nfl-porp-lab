"""Write leak-safe empirical error profiles for the shared NFL player model."""
import json
import sys
from pathlib import Path

from backtest_player_baselines import backtest


def build(directory):
    report=backtest(Path(directory),include_distributions=True)
    return report['forecastDistributions']


if __name__=='__main__':
    if len(sys.argv)!=3:
        raise SystemExit('Usage: python scripts/build_nfl_player_distributions.py DATA_DIRECTORY OUTPUT_JSON')
    source=Path(sys.argv[1])
    output=Path(sys.argv[2])
    distributions=build(source)
    if not distributions.get('markets'):
        raise SystemExit('No chronological player forecast errors available; existing output was left unchanged.')
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary=output.with_suffix(output.suffix+'.tmp')
    temporary.write_text(json.dumps(distributions,separators=(',',':'))+'\n',encoding='utf-8')
    temporary.replace(output)
    print(json.dumps({'output':str(output),'trainedThrough':distributions['trainedThrough'],
                      'markets':len(distributions['markets']),
                      'profilesWith100PlusSamples':sum(v['sampleSize']>=distributions['minimumSamples']
                                                       for v in distributions['markets'].values()),
                      'validatedProfiles':sum(v.get('validation',{}).get('calibrated',False)
                                              for v in distributions['markets'].values())}))
