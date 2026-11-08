import React, {Children, useId} from 'react';

export default function ChartSelect({label, value, onChange, children}) {
  const id = useId();
  const values = Children.toArray(children).map(option => String(option.props.value ?? option.props.children));
  const index = values.indexOf(String(value));
  return <div className="chart-filter">
    <label htmlFor={id}>{label}</label>
    <div className="chart-select-row">
      <select id={id} value={value} onChange={event => onChange(event.target.value)}>{children}</select>
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
