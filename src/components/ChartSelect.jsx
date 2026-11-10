import React, {Children, useId} from 'react';
import FilterMenu from './FilterMenu.jsx';

const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});

function optionLabel(option){
  return Children.toArray(option.props.children).join('');
}

export default function ChartSelect({label, value, onChange, children}) {
  const id = useId();
  const options = Children.toArray(children).sort((a,b)=>{
    const first=optionLabel(a), second=optionLabel(b);
    return Number(/^All\b/i.test(second))-Number(/^All\b/i.test(first)) || collator.compare(first,second);
  });
  const values = options.map(option => String(option.props.value ?? optionLabel(option)));
  const index = values.indexOf(String(value));
  return <div className="chart-filter">
    <label htmlFor={id}>{label}</label>
    <div className="chart-select-row">
      <FilterMenu id={id} aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{options}</FilterMenu>
      <div className="chart-step-buttons">
        {[-1, 1].map(step => {
          const action = step < 0 ? 'Previous' : 'Next';
          const name = action + ' ' + label.toLowerCase();
          return <button key={step} type="button" aria-label={name} title={name}
            disabled={index < 0 || values[index + step] === undefined}
            onClick={() => onChange(values[index + step])}>
            <span className={step < 0 ? 'chart-step-up' : 'chart-step-down'} aria-hidden="true"/>
          </button>;
        })}
      </div>
    </div>
  </div>;
}
