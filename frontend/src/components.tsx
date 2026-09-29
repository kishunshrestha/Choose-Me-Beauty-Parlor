import { useEffect, useRef, type ReactNode } from 'react';
import { X, Sparkles, Scissors, Flower2, Leaf, Paintbrush } from 'lucide-react';
export function Brand({light = false}: {light?: boolean}) {
  return <a className={`brand ${light ? 'brand-light' : ''}`} href="/" aria-label="Choose Me home"><span>choose me<span className="brand-dot">.</span></span><small>MAKEUP STUDIO & ACADEMY</small></a>;
}
export function Icon({name, size=25}: {name?: string; size?: number}) {
  const C = ({sparkles:Sparkles,scissors:Scissors,flower:Flower2,leaf:Leaf,brush:Paintbrush})[name || ''] || Sparkles;
  return <C size={size} strokeWidth={1.25} aria-hidden="true"/>;
}
export function Modal({title, children, onClose, wide=false}: {title: string; children: ReactNode; onClose: ()=>void; wide?: boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const node=ref.current;node?.showModal();const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;node?.close();};},[]);
  return <dialog ref={ref} className={`modal ${wide?'modal-wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby="dialog-title"><div className="modal-inner"><div className="modal-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={22}/></button></div>{children}</div></dialog>;
}
export function ErrorBox({message}: {message: string}) {return message ? <div className="error-box" role="alert">{message}</div> : null;}
export function Empty({title, description, children}: {title: string; description: string; children?: ReactNode}) {
  return <div className="empty-state"><Sparkles size={28} strokeWidth={1.2}/><h3>{title}</h3><p>{description}</p>{children}</div>;
}
