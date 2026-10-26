import { useId } from 'react';

/**
 * Satu isian form: label, teks bantuan, pesan galat, dan atribut aksesibilitas
 * yang menghubungkan ketiganya ke input. Input dibuat lewat render prop:
 *   <Isian label="Posisi" galat={g.posisi}>{(p) => <input {...p} />}</Isian>
 */
export function Isian({ label, bantuan, galat, children, className = '' }) {
  const id = useId();
  const idBantuan = bantuan ? `${id}-bantuan` : undefined;
  const idGalat = galat ? `${id}-galat` : undefined;
  const props = {
    id,
    'aria-invalid': galat ? 'true' : undefined,
    'aria-describedby': [idBantuan, idGalat].filter(Boolean).join(' ') || undefined,
  };
  return (
    <div className={`isian ${className}`}>
      <label htmlFor={id}>{label}</label>
      {bantuan && (
        <span className="bantuan" id={idBantuan}>
          {bantuan}
        </span>
      )}
      {children(props)}
      {galat && (
        <span className="galat" id={idGalat}>
          {galat}
        </span>
      )}
    </div>
  );
}
