import { useLayoutEffect, useRef } from 'react';
import { writeRasterNumber } from './rasterNumberDom';
import './raster-number.css';

export function RasterNumber({children,tabular=false,className=''}:{children:string|number;tabular?:boolean;className?:string}) {
  const ref = useRef<HTMLSpanElement>(null), value = String(children);
  useLayoutEffect(() => { if(ref.current) writeRasterNumber(ref.current,value,tabular); },[value,tabular]);
  return <span ref={ref} className={`raster-number ${className}`} role="img" aria-label={value}/>;
}
