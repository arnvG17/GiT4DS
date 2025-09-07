import React, { useState, useEffect } from 'react';

const ACCEPTED = ['image/jpeg','image/png','image/webp','application/pdf'];
const MAX = 15 * 1024 * 1024; // 15MB

export default function FileUploadPreview(){
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [savedList, setSavedList] = useState(() => {
    const raw = sessionStorage.getItem('uploads');
    return raw ? JSON.parse(raw) : [];
  });

  useEffect(() => {
    sessionStorage.setItem('uploads', JSON.stringify(savedList));
  }, [savedList]);

  const onChange = (e) => {
    setError('');
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) return setError('Invalid file type');
    if (f.size > MAX) return setError('File too large');
    const url = URL.createObjectURL(f);
    setFile({ file: f, preview: url });
  };

  const onSave = (e) => {
    e.preventDefault();
    if (!file) return setError('No file selected');
    const item = { id: Date.now(), title: e.target.title.value || file.file.name, type: file.file.type, size: file.file.size, createdAt: new Date().toISOString(), preview: file.preview };
    setSavedList(s => [item, ...s]);
    setFile(null);
    e.target.reset();
  };

  const onClear = () => setFile(null);

  return (
    <div>
      <form onSubmit={onSave}>
        <input type="file" onChange={onChange} />
        {error && <div style={{ color: 'red' }}>{error}</div>}
        {file && (
          <div>
            <div>Preview:</div>
            {file.file.type === 'application/pdf' ? <iframe src={file.preview} width={200} height={200} title="pdf" /> : <img src={file.preview} alt="preview" style={{ maxWidth: 200 }} />}
            <div>
              <label>Title</label>
              <input name="title" />
            </div>
            <button type="submit">Save to session</button>
            <button type="button" onClick={onClear}>Reset</button>
          </div>
        )}
      </form>

      <h4>Saved in this tab:</h4>
      <ul>
        {savedList.map(i => (
          <li key={i.id} style={{ marginBottom: 8 }}>
            {i.type.startsWith('image') ? <img src={i.preview} alt="t" width={60} /> : <div style={{ width: 60, height: 60, border: '1px solid #ccc', display: 'inline-block' }}>PDF</div>}
            <div>{i.title}</div>
            <div>{i.type} • {(i.size/1024).toFixed(1)} KB</div>
            <div>{new Date(i.createdAt).toLocaleString()}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
