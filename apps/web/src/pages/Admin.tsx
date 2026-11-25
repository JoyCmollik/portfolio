import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, CircleAlert, Code2,
  ExternalLink, FileText, FolderKanban, ImagePlus, LayoutDashboard, LoaderCircle, LogOut,
  Plus, Save, Settings2, ShieldCheck, Sparkles, Trash2, Users, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePortfolio } from '../context/PortfolioContext';
import { api, safeUrl } from '../lib/api';
import type { AccountStatus, Experience, Post, Project, Role, Site, SkillGroup, User } from '../types';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
type Section = 'overview' | 'profile' | 'experience' | 'skills' | 'projects' | 'posts' | 'people';
type Notice = { kind: 'success' | 'error'; text: string } | null;
const defaultProject: Project = { title: '', slug: '', category: 'BACKEND / PRODUCT', summary: '', description: '', stack: [], featured: false, order: 10, accent: 'blue', imageUrl: '', links: { github: '', demo: '' }, status: 'draft' };
const defaultPost: Post = { title: '', slug: '', excerpt: '', body: '', tags: [], coverImage: '', status: 'draft' };
const nav: { key: Section; text: string; icon: typeof Settings2; group: string }[] = [
  { key: 'overview', text: 'Overview', icon: LayoutDashboard, group: 'GENERAL' },
  { key: 'profile', text: 'Site & profile', icon: Settings2, group: 'CONTENT' },
  { key: 'experience', text: 'Experience', icon: Code2, group: 'CONTENT' },
  { key: 'skills', text: 'Skills & stats', icon: Sparkles, group: 'CONTENT' },
  { key: 'projects', text: 'Projects', icon: FolderKanban, group: 'CONTENT' },
  { key: 'posts', text: 'Blog articles', icon: BookOpen, group: 'CONTENT' },
  { key: 'people', text: 'Team & roles', icon: Users, group: 'ACCESS' },
];
function FormField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="admin-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function TextInput({ value, onChange, placeholder = '', type = 'text' }: { value: string | number; onChange: (s: string) => void; placeholder?: string; type?: string }) { return <input className="admin-input" type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}/>; }
function TextArea({ value, onChange, rows = 4, placeholder = '' }: { value: string; onChange: (s: string) => void; rows?: number; placeholder?: string }) { return <textarea className="admin-input admin-textarea" rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}/>; }
function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) { return <label className="admin-toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}/><span className="toggle-track"/>{children}</label>; }
function Split({ children }: { children: ReactNode }) { return <div className="admin-form-grid">{children}</div>; }
function FormActions({ onSave, saving, label = 'Save changes' }: { onSave: () => void; saving: boolean; label?: string }) { return <div className="admin-form-actions"><button type="button" className="admin-primary" onClick={onSave} disabled={saving}>{saving ? <LoaderCircle className="spin" size={17}/> : <Save size={17}/>} {saving ? 'Saving…' : label}</button><span>Changes are saved to MongoDB.</span></div>; }
function UploadField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setMessage('');
    try { const body = new FormData(); body.append('image', file); const result = await api<{ url: string }>('/admin/upload', { method: 'POST', body }); onChange(result.url); setMessage('Uploaded. Save the form to apply.'); }
    catch (err) { setMessage((err as Error).message); }
    finally { setBusy(false); e.target.value = ''; }
  };
  return <div className="admin-field"><span>{label}</span><div className="admin-media-field">
    <div className="admin-media-thumb">{safeUrl(value) ? <img src={safeUrl(value)} alt="Selected media"/> : <ImagePlus size={28}/>}</div>
    <div className="admin-media-controls"><label className="upload-button"><ImagePlus size={16}/>{busy ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy} hidden/></label><TextInput value={value} onChange={onChange} placeholder="/uploads/photo.webp or https://…"/><small>JPG, PNG or WebP · Max 6 MB. Local uploads require persistent disk in production.</small>{message && <small>{message}</small>}</div>
  </div></div>;
}
function Dashboard({ onNavigate }: { onNavigate: (key: Section) => void }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ projects: 0, posts: 0, published: 0, users: 0, pending: 0 });
  useEffect(() => { void api<typeof counts>('/admin/overview').then(setCounts).catch(() => {}); }, []);
  const tiles = [
    { title: 'Projects', value: counts.projects, icon: FolderKanban, to: 'projects' as Section, info: 'In your portfolio' },
    { title: 'Articles', value: counts.posts, icon: FileText, to: 'posts' as Section, info: `${counts.published} published` },
    { title: 'People', value: counts.users, icon: Users, to: 'people' as Section, info: `${counts.pending} awaiting approval` }
  ];
  const visibleTiles = user?.role === 'editor' ? tiles.filter(t => t.to !== 'people') : tiles;
  return <><div className="admin-welcome"><div className="welcome-spark"><Sparkles size={19}/></div><div><h2>Make something worth sharing.</h2><p>Your portfolio is a living document. Keep the good work up to date.</p></div><Link to="/" target="_blank" className="admin-small-button">Visit website <ExternalLink size={15}/></Link></div>
    <div className="admin-stat-grid">{visibleTiles.map(tile => <button key={tile.title} className="admin-stat" onClick={() => onNavigate(tile.to)}><div className="admin-stat-heading"><span>{tile.title}</span><tile.icon size={19}/></div><strong>{tile.value.toString().padStart(2,'0')}</strong><span className="admin-stat-foot">{tile.info}<ArrowRight size={15}/></span></button>)}</div>
    <div className="admin-two-cols"><div className="admin-panel"><div className="admin-panel-title"><h3>Quick actions</h3><span>KEEP IT FRESH</span></div><button className="admin-action-row" onClick={() => onNavigate('posts')}><BookOpen size={19}/><div><strong>Write a new article</strong><span>Share a lesson or a recent discovery.</span></div><ArrowUpRight size={17}/></button><button className="admin-action-row" onClick={() => onNavigate('projects')}><FolderKanban size={19}/><div><strong>Update a project</strong><span>Show the things you've been building.</span></div><ArrowUpRight size={17}/></button><button className="admin-action-row" onClick={() => onNavigate('profile')}><Settings2 size={19}/><div><strong>Polish your profile</strong><span>Keep your story, photo, and links current.</span></div><ArrowUpRight size={17}/></button></div>
      <div className="admin-panel admin-checklist"><div className="admin-panel-title"><h3>Launch checklist</h3><span>GET READY</span></div><div className="checklist-row"><Check size={15}/> Add your public email and social links</div><div className="checklist-row"><Check size={15}/> Replace sample articles with original posts</div><div className="checklist-row"><Check size={15}/> Connect your own project links</div><div className="checklist-row"><Check size={15}/> Configure Google credentials and domain</div><p>This is your workspace. Only approved editors can change published content.</p></div></div>
  </>;
}
function ProfileEditor({ value, setValue, onSave, saving }: { value: Site; setValue: (v: Site) => void; onSave: () => void; saving: boolean }) {
  const update = (key: keyof Site, v: string) => setValue({ ...value, [key]: v });
  return <div className="admin-panel admin-editor"><div className="admin-panel-title"><h3>Public identity</h3><span>HOMEPAGE & ABOUT</span></div><Split>
      <FormField label="Full name"><TextInput value={value.name} onChange={v => update('name',v)}/></FormField>
      <FormField label="Display name"><TextInput value={value.shortName} onChange={v => update('shortName',v)}/></FormField>
      <FormField label="Professional title"><TextInput value={value.title} onChange={v => update('title',v)}/></FormField>
      <FormField label="Location"><TextInput value={value.location} onChange={v => update('location',v)}/></FormField>
      <FormField label="Hero eyebrow"><TextInput value={value.heroKicker} onChange={v => update('heroKicker',v)}/></FormField>
      <FormField label="Availability status"><TextInput value={value.availability} onChange={v => update('availability',v)}/></FormField>
      <FormField label="Hero heading, first line"><TextInput value={value.heroLine1} onChange={v => update('heroLine1',v)}/></FormField>
      <FormField label="Hero heading, second line"><TextInput value={value.heroLine2} onChange={v => update('heroLine2',v)}/></FormField>
    </Split><FormField label="Hero introduction"><TextArea value={value.heroDescription} onChange={v => update('heroDescription',v)}/></FormField>
      <Split><FormField label="About section heading"><TextInput value={value.aboutHeading} onChange={v => update('aboutHeading',v)}/></FormField><FormField label="Public contact email"><TextInput type="email" value={value.email} onChange={v => update('email',v)} placeholder="hello@yourdomain.com"/></FormField></Split>
      <FormField label="About description"><TextArea rows={6} value={value.aboutText} onChange={v => update('aboutText',v)}/></FormField>
      <div className="admin-panel-subtitle">Images & media</div><UploadField label="Hero portrait (vertical 3:4 or transparent image)" value={value.heroImage} onChange={v => update('heroImage',v)}/><UploadField label="About portrait" value={value.portraitImage} onChange={v => update('portraitImage',v)}/>
      <div className="admin-panel-subtitle">Your links</div><Split>
        <FormField label="GitHub"><TextInput value={value.socials.github} onChange={v => setValue({ ...value, socials: { ...value.socials, github: v } })} placeholder="https://github.com/..."/></FormField>
        <FormField label="LinkedIn"><TextInput value={value.socials.linkedin} onChange={v => setValue({ ...value, socials: { ...value.socials, linkedin: v } })} placeholder="https://linkedin.com/in/..."/></FormField>
        <FormField label="Website"><TextInput value={value.socials.website} onChange={v => setValue({ ...value, socials: { ...value.socials, website: v } })}/></FormField>
        <FormField label="Resume URL"><TextInput value={value.resumeUrl} onChange={v => update('resumeUrl',v)} placeholder="https://…/resume.pdf"/></FormField>
      </Split><FormActions onSave={onSave} saving={saving}/>
    </div>;
}
function ExperienceEditor({ value, setValue, onSave, saving }: { value: Site; setValue: (v: Site) => void; onSave: () => void; saving: boolean }) {
  const setJob = (i: number, job: Experience) => setValue({ ...value, experience: value.experience.map((v,k) => i === k ? job : v) });
  return <div className="admin-panel admin-editor"><div className="admin-panel-title"><h3>Professional timeline</h3><button className="admin-secondary" onClick={() => setValue({ ...value, experience: [...value.experience, { company: '', role: '', period: '', location: '', description: '' }] })}><Plus size={15}/> Add role</button></div>
    {value.experience.map((job,i) => <div className="admin-repeat-item" key={i}><div className="admin-repeat-heading"><h4>Experience {i+1}</h4><button type="button" className="admin-delete-light" onClick={() => setValue({ ...value, experience: value.experience.filter((_,k) => k !== i) })}><Trash2 size={15}/> Remove</button></div><Split>
      <FormField label="Company"><TextInput value={job.company} onChange={v => setJob(i,{...job,company:v})}/></FormField>
      <FormField label="Role"><TextInput value={job.role} onChange={v => setJob(i,{...job,role:v})}/></FormField>
      <FormField label="Period"><TextInput value={job.period} onChange={v => setJob(i,{...job,period:v})} placeholder="2025 — Present"/></FormField>
      <FormField label="Location"><TextInput value={job.location} onChange={v => setJob(i,{...job,location:v})}/></FormField>
    </Split><FormField label="Summary"><TextArea value={job.description} onChange={v => setJob(i,{...job,description:v})}/></FormField></div>)}
    <FormActions onSave={onSave} saving={saving}/></div>;
}
function SkillsEditor({ value, setValue, onSave, saving }: { value: Site; setValue: (v: Site) => void; onSave: () => void; saving: boolean }) {
  const setGroup = (i: number, group: SkillGroup) => setValue({ ...value, skillGroups: value.skillGroups.map((g,j) => i===j?group:g) });
  return <div className="admin-panel admin-editor"><div className="admin-panel-title"><h3>Skills & visual clusters</h3><button className="admin-secondary" onClick={() => setValue({ ...value, skillGroups: [...value.skillGroups, { title: 'New group', items: [] }] })}><Plus size={15}/> Add group</button></div><p className="admin-helper">The first three groups become the colored clusters in the interactive D3 skill map.</p>
    {value.skillGroups.map((g,i) => <div className="admin-repeat-item" key={i}><div className="admin-repeat-heading"><h4>Group {i+1}</h4><button className="admin-delete-light" onClick={() => setValue({ ...value, skillGroups: value.skillGroups.filter((_,j) => j !== i) })}><Trash2 size={15}/> Remove</button></div><FormField label="Category"><TextInput value={g.title} onChange={v => setGroup(i,{...g,title:v})}/></FormField><FormField label="Skills (comma separated)"><TextArea rows={2} value={g.items.join(', ')} onChange={v => setGroup(i,{...g,items:v.split(',').map(s=>s.trim()).filter(Boolean)})}/></FormField></div>)}
    <div className="admin-panel-subtitle">Hero metrics</div>{value.stats.map((stat,i) => <div key={i} className="admin-metric-row"><Split><FormField label={`Metric ${i+1} value`}><TextInput value={stat.value} onChange={v => setValue({ ...value, stats: value.stats.map((s,j)=>i===j?{...s,value:v}:s) })}/></FormField><FormField label="Label"><TextInput value={stat.label} onChange={v => setValue({ ...value, stats: value.stats.map((s,j)=>i===j?{...s,label:v}:s) })}/></FormField></Split><button className="admin-delete-light" onClick={() => setValue({ ...value, stats: value.stats.filter((_,j) => j !== i) })}><Trash2 size={14}/> Remove metric</button></div>)}<button className="admin-secondary" disabled={value.stats.length>=8} onClick={() => setValue({ ...value, stats: [...value.stats, { value: '', label: '' }] })}><Plus size={15}/> Add metric</button>
    <FormActions onSave={onSave} saving={saving}/></div>;
}
function ProjectEditor({ onNotice, onChanged }: { onNotice: (notice: Notice) => void; onChanged: () => void }) {
  const [list, setList] = useState<Project[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { const result = await api<{ projects: Project[] }>('/admin/projects'); setList(result.projects); } catch(err){onNotice({kind:'error',text:(err as Error).message});} };
  useEffect(() => { void load(); }, []); // load once when editor mounts
  const save = async () => {
    if (!editing) return; setBusy(true); onNotice(null);
    try { await api(`/admin/projects${editing._id ? `/${editing._id}` : ''}`, { method: editing._id ? 'PUT' : 'POST', body: JSON.stringify(editing) });
      await load(); onChanged(); setEditing(null); onNotice({kind:'success',text:'Project saved successfully.'}); }
    catch(err){onNotice({kind:'error',text:(err as Error).message});} finally{setBusy(false);}
  };
  const remove = async (item: Project) => {
    if (!item._id || !window.confirm(`Delete "${item.title}" permanently?`)) return;
    try { await api(`/admin/projects/${item._id}`, { method:'DELETE' }); await load(); onChanged(); onNotice({kind:'success',text:'Project deleted.'}); }
    catch(err) { onNotice({kind:'error',text:(err as Error).message}); }
  };
  const set = (value: Partial<Project>) => setEditing(cur => cur ? { ...cur, ...value } : cur);
  return <div className="admin-panel admin-editor"><div className="admin-panel-title"><h3>{editing ? (editing._id ? 'Edit project' : 'New project') : 'Your projects'}</h3><button className="admin-secondary" onClick={() => setEditing(editing ? null : { ...defaultProject })}>{editing ? <X size={15}/> : <Plus size={15}/>} {editing ? 'Back to list' : 'New project'}</button></div>
    {!editing ? <div className="admin-list">{list.map(item => <div className="admin-list-row" key={item._id}><div className={`admin-list-avatar accent-${item.accent}`}><FolderKanban size={19}/></div><div className="admin-list-main"><strong>{item.title}</strong><span>{item.category} <span className="admin-subdot">·</span> {item.status}</span></div><button className="admin-row-button" onClick={() => setEditing({ ...item })}>Edit <ArrowUpRight size={15}/></button><button className="admin-delete-icon" onClick={() => void remove(item)} aria-label={`Delete ${item.title}`}><Trash2 size={16}/></button></div>)}{list.length===0&&<p className="admin-helper">No projects yet. Create your first one.</p>}</div> : <>
      <Split><FormField label="Project name"><TextInput value={editing.title} onChange={v=>set({title:v})}/></FormField><FormField label="URL slug"><TextInput value={editing.slug} onChange={v=>set({slug:v})} placeholder="Generated from title if empty"/></FormField>
        <FormField label="Category"><TextInput value={editing.category} onChange={v=>set({category:v})}/></FormField><FormField label="Display order"><TextInput type="number" value={editing.order} onChange={v=>set({order:Number(v)||0})}/></FormField></Split>
      <FormField label="Card summary"><TextArea value={editing.summary} onChange={v=>set({summary:v})} rows={2}/></FormField><FormField label="Case study overview"><TextArea value={editing.description} onChange={v=>set({description:v})} rows={6}/></FormField>
      <FormField label="Technologies (comma separated)"><TextInput value={editing.stack.join(', ')} onChange={v=>set({stack:v.split(',').map(s=>s.trim()).filter(Boolean)})}/></FormField><Split><FormField label="GitHub link"><TextInput value={editing.links.github} onChange={v=>set({links:{...editing.links,github:v}})}/></FormField><FormField label="Live demo link"><TextInput value={editing.links.demo} onChange={v=>set({links:{...editing.links,demo:v}})}/></FormField>
        <FormField label="Card artwork color"><select className="admin-input" value={editing.accent} onChange={e=>set({accent:e.target.value as Project['accent']})}>{['emerald','violet','blue','orange','rose'].map(v=><option key={v} value={v}>{v}</option>)}</select></FormField><FormField label="Publication status"><select className="admin-input" value={editing.status} onChange={e=>set({status:e.target.value as Project['status']})}><option value="draft">Draft — private</option><option value="published">Published — public</option></select></FormField></Split>
      <UploadField label="Optional project screenshot" value={editing.imageUrl} onChange={v=>set({imageUrl:v})}/>
      <Toggle checked={editing.featured} onChange={v=>set({featured:v})}>Feature on homepage</Toggle>
      <FormActions onSave={save} saving={busy} label={editing._id ? 'Save project' : 'Create project'}/>
    </>}
  </div>;
}
function PostEditor({ onNotice, onChanged }: { onNotice: (notice: Notice) => void; onChanged: () => void }) {
  const [list, setList] = useState<Post[]>([]); const [editing, setEditing] = useState<Post | null>(null); const [preview, setPreview] = useState(false); const [busy, setBusy] = useState(false);
  const load = async () => { try { const result = await api<{ posts: Post[] }>('/admin/posts'); setList(result.posts); } catch(err){onNotice({kind:'error',text:(err as Error).message});} };
  useEffect(() => { void load(); }, []);
  const set = (value: Partial<Post>) => setEditing(cur => cur ? { ...cur, ...value } : cur);
  const save = async () => {
    if (!editing) return; setBusy(true); onNotice(null);
    try { await api(`/admin/posts${editing._id?`/${editing._id}`:''}`, { method: editing._id?'PUT':'POST', body: JSON.stringify(editing) }); await load(); onChanged(); setEditing(null); onNotice({kind:'success',text:'Article saved successfully.'}); }
    catch(err){onNotice({kind:'error',text:(err as Error).message});} finally{setBusy(false);}
  };
  const remove = async (item: Post) => {
    if (!item._id || !window.confirm(`Delete "${item.title}" permanently?`)) return;
    try { await api(`/admin/posts/${item._id}`, {method:'DELETE'}); await load(); onChanged(); onNotice({kind:'success',text:'Article deleted.'}); }
    catch(err){onNotice({kind:'error',text:(err as Error).message});}
  };
  return <div className="admin-panel admin-editor"><div className="admin-panel-title"><h3>{editing ? editing._id ? 'Edit article':'New article':'Your writing'}</h3><button className="admin-secondary" onClick={()=>{setEditing(editing?null:{...defaultPost});setPreview(false);}}>{editing?<X size={15}/>:<Plus size={15}/>} {editing?'Back to list':'New article'}</button></div>
    {!editing?<div className="admin-list">{list.map(item=><div className="admin-list-row" key={item._id}><div className="admin-list-avatar admin-list-post"><BookOpen size={19}/></div><div className="admin-list-main"><strong>{item.title}</strong><span>{item.tags.slice(0,2).join(' · ')} <span className="admin-subdot">·</span> {item.status}</span></div><button className="admin-row-button" onClick={()=>setEditing({...item})}>Edit <ArrowUpRight size={15}/></button><button className="admin-delete-icon" onClick={()=>void remove(item)} aria-label={`Delete ${item.title}`}><Trash2 size={16}/></button></div>)}{!list.length&&<p className="admin-helper">Your writing archive is empty. Start with a new article.</p>}</div>:<>
      <Split><FormField label="Article title"><TextInput value={editing.title} onChange={v=>set({title:v})}/></FormField><FormField label="URL slug"><TextInput value={editing.slug} onChange={v=>set({slug:v})} placeholder="Generated if empty"/></FormField></Split>
      <FormField label="Short description"><TextArea rows={2} value={editing.excerpt} onChange={v=>set({excerpt:v})}/></FormField>
      <Split><FormField label="Topics (comma separated)"><TextInput value={editing.tags.join(', ')} onChange={v=>set({tags:v.split(',').map(s=>s.trim()).filter(Boolean)})}/></FormField><FormField label="Status"><select className="admin-input" value={editing.status} onChange={e=>set({status:e.target.value as Post['status']})}><option value="draft">Draft — private</option><option value="published">Published — public</option></select></FormField></Split>
      <UploadField label="Optional cover image" value={editing.coverImage} onChange={v=>set({coverImage:v})}/>
      <div className="admin-editor-title"><span>Article body · Markdown</span><div className="admin-segment"><button className={!preview?'segment-active':''} onClick={()=>setPreview(false)}>Edit</button><button className={preview?'segment-active':''} onClick={()=>setPreview(true)}>Preview</button></div></div>
      {preview?<div className="admin-markdown-preview article-content"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{editing.body||'*Nothing here yet.*'}</ReactMarkdown></div>:<textarea className="admin-input admin-markdown-input" rows={20} value={editing.body} onChange={e=>set({body:e.target.value})} placeholder={'## Your article\n\nWrite in Markdown…'}/>}<FormActions onSave={save} saving={busy} label={editing._id?'Save article':'Publish changes'}/>
    </>}
  </div>;
}
function PeopleEditor({ onNotice }: { onNotice: (notice: Notice) => void }) {
  const { user } = useAuth(); const [people, setPeople] = useState<User[]>([]); const [saving, setSaving] = useState<string|null>(null);
  const load = async () => { try { const r=await api<{users:User[]}>('/admin/users'); setPeople(r.users); } catch(err){onNotice({kind:'error',text:(err as Error).message});} };
  useEffect(() => { void load(); }, []);
  const update = (id:string,key:'role'|'status', value:string) => setPeople(p=>p.map(u=>u.id===id?{...u,[key]:value}:u));
  const save = async (person:User) => { setSaving(person.id); try{await api(`/admin/users/${person.id}`,{method:'PATCH',body:JSON.stringify({role:person.role,status:person.status})});await load();onNotice({kind:'success',text:`Access updated for ${person.name}. Previous sessions were revoked.`});}catch(err){onNotice({kind:'error',text:(err as Error).message});}finally{setSaving(null);} };
  return <div className="admin-panel admin-editor"><div className="admin-panel-title"><h3>People & permissions</h3><span>SECURE ACCESS</span></div><p className="admin-helper">The first verified Google account is the permanent owner. Later sign-ins are pending by default. Approve them and assign editor, viewer, or admin roles. Only the owner can grant admin access.</p>
    <div className="admin-users-list">{people.map(person=>{const locked=person.role==='owner'||person.id===user?.id||(user?.role!=='owner'&&person.role==='admin');return <div className="admin-user-row" key={person.id}><div className="admin-user-identity">{safeUrl(person.avatar)?<img src={safeUrl(person.avatar)} alt=""/>:<span>{person.name.slice(0,1).toUpperCase()}</span>}<div><strong>{person.name}{person.id===user?.id?' (you)':''}</strong><small>{person.email}</small></div></div><div className="admin-user-controls"><select className="admin-input" aria-label={`Role for ${person.name}`} disabled={locked} value={person.role} onChange={e=>update(person.id,'role',e.target.value as Role)}>{person.role==='owner'&&<option value="owner">Owner</option>}<option value="viewer">Viewer</option><option value="editor">Editor</option>{user?.role==='owner'&&<option value="admin">Admin</option>}</select><select className="admin-input" aria-label={`Status for ${person.name}`} disabled={locked} value={person.status} onChange={e=>update(person.id,'status',e.target.value as AccountStatus)}><option value="pending">Pending</option><option value="active">Active</option><option value="disabled">Disabled</option></select><button className="admin-small-button" disabled={locked||saving===person.id} onClick={()=>void save(person)}>{saving===person.id?'Saving…':'Save'}</button></div></div>;})}</div>
  </div>;
}
function SigninPage() {
  const { user, loading, loginGoogle, logout } = useAuth(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <div className="admin-login-page"><Link to="/" className="admin-login-back"><ArrowLeft size={16}/> BACK TO PORTFOLIO</Link><div className="admin-login-card"><div className="login-logo">J<span>.</span></div><div className="login-caption">YOUR WORKSPACE</div><h1>{user ? user.status==='pending'?'Access awaiting approval':'Account not active':'Welcome back.'}</h1><p>{user ? `You're signed in as ${user.email}. ${user.status==='pending'?'An existing admin needs to activate your account.':'Please contact the owner if access was disabled.'}` : 'One Google account. A secure place to manage your portfolio, projects, and stories.'}</p>
    {loading?<LoaderCircle className="spin"/>:user?<button className="admin-secondary" onClick={()=>void logout()}><LogOut size={16}/> Sign out</button>:clientId?<div className="google-signin"><GoogleLogin theme="filled_black" shape="pill" size="large" width="280" onSuccess={async res=>{if(!res.credential){setError('Google did not return a credential.');return;}setBusy(true);setError('');try{await loginGoogle(res.credential);}catch(err){setError((err as Error).message);}finally{setBusy(false);}}} onError={()=>setError('Google sign-in was cancelled or unavailable.')}/></div>:<div className="auth-not-configured"><CircleAlert size={20}/> Add VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID in the environment files to enable login.</div>}
    {busy&&<span className="admin-helper">Verifying with Google…</span>}{error&&<div className="admin-alert error"><CircleAlert size={16}/>{error}</div>}
    <div className="login-security"><ShieldCheck size={16}/> Secure Google ID verification + HTTP-only session cookie</div>
  </div></div>;
}
export default function Admin() {
  const { user, loading, logout } = useAuth(); const { site, refresh, isDemo } = usePortfolio();
  const [section,setSection] = useState<Section>('overview');
  const [localSite,setLocalSite] = useState<Site>(site);
  const [notice,setNotice] = useState<Notice>(null);
  const [saving,setSaving] = useState(false);
  const [mobileMenu,setMobileMenu] = useState(false);
  useEffect(()=>{setLocalSite(site);},[site]);
  useEffect(()=>{setNotice(null);},[section]);
  if (loading) return <div className="admin-loading"><LoaderCircle className="spin"/> Loading your workspace…</div>;
  if (!user || user.status!=='active'||!['owner','admin','editor'].includes(user.role)) return <SigninPage/>;
  const visibleNav=nav.filter(n=>n.key!=='people'||['owner','admin'].includes(user.role));
  const saveSite=async()=>{setSaving(true);setNotice(null);try{await api('/admin/site',{method:'PUT',body:JSON.stringify(localSite)});await refresh();setNotice({kind:'success',text:'Public site content updated successfully.'});}catch(err){setNotice({kind:'error',text:(err as Error).message});}finally{setSaving(false);}};
  const title=visibleNav.find(n=>n.key===section)?.text||'Overview';
  return <div className="admin-shell"><aside className={`admin-sidebar ${mobileMenu?'sidebar-open':''}`}><div className="admin-brand"><Link to="/" className="brand"><span className="brand-symbol">J<span>.</span></span><span className="brand-letters">joy<span className="brand-light">/</span>studio</span></Link><span className="admin-brand-caption">CONTENT STUDIO</span></div>
    <nav className="admin-nav">{visibleNav.map((item,i)=><div key={item.key}>{(i===0||visibleNav[i-1].group!==item.group)&&<span className="admin-nav-group">{item.group}</span>}<button type="button" className={section===item.key?'selected':''} onClick={()=>{setSection(item.key);setMobileMenu(false);}}><item.icon size={18}/>{item.text}{section===item.key&&<span className="admin-nav-selected"/>}</button></div>)}</nav>
    <div className="admin-sidebar-bottom"><Link to="/" target="_blank"><ExternalLink size={17}/> View live site <ArrowUpRight size={15}/></Link><button onClick={()=>void logout()}><LogOut size={17}/> Sign out</button><div className="admin-sidebar-user">{safeUrl(user.avatar)?<img src={safeUrl(user.avatar)} alt=""/>:<span>{user.name.charAt(0)}</span>}<div><strong>{user.name}</strong><small>{user.role.toUpperCase()}</small></div><ChevronDown size={16}/></div></div>
  </aside><div className="admin-page"><header className="admin-topbar"><button type="button" className="admin-menu-button" onClick={()=>setMobileMenu(!mobileMenu)} aria-label="Toggle sidebar"><Settings2 size={20}/></button><div className="admin-crumb">WORKSPACE <span>/</span> {title.toUpperCase()}</div><div className="admin-topbar-right"><span><span className="live-dot"/> SYSTEM ACTIVE</span><Link to="/" target="_blank" className="admin-top-visit">Live website <ArrowUpRight size={15}/></Link></div></header>
      <div className="admin-content"><div className="admin-page-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> PORTFOLIO CONTROL CENTER</div><h1>{title}<span className="admin-heading-dot">.</span></h1><p>{section==='overview'?'A clear view of everything that makes your portfolio yours.':section==='people'?'Control exactly who can see and edit your content.':'Make changes here and they’ll appear on the public site.'}</p></div><span className="admin-timestamp">{new Intl.DateTimeFormat('en',{month:'short',year:'numeric'}).format(new Date())}</span></div>
      {isDemo&&<div className="admin-alert warning"><CircleAlert size={17}/> API is offline — the public website is in preview mode. Connect MongoDB to save changes.</div>}
      {notice&&<div role="status" className={`admin-alert ${notice.kind}`}><span>{notice.kind==='success'?<Check size={17}/>:<CircleAlert size={17}/>}</span>{notice.text}<button type="button" aria-label="Dismiss" onClick={()=>setNotice(null)}><X size={16}/></button></div>}
      {section==='overview'&&<Dashboard onNavigate={setSection}/>}
      {section==='profile'&&<ProfileEditor value={localSite} setValue={setLocalSite} onSave={()=>void saveSite()} saving={saving}/>}
      {section==='experience'&&<ExperienceEditor value={localSite} setValue={setLocalSite} onSave={()=>void saveSite()} saving={saving}/>}
      {section==='skills'&&<SkillsEditor value={localSite} setValue={setLocalSite} onSave={()=>void saveSite()} saving={saving}/>}
      {section==='projects'&&<ProjectEditor onNotice={setNotice} onChanged={()=>void refresh()}/>}
      {section==='posts'&&<PostEditor onNotice={setNotice} onChanged={()=>void refresh()}/>}
      {section==='people'&&<PeopleEditor onNotice={setNotice}/>}
      <footer className="admin-footer">JOY/STUDIO <span>·</span> CREATED FOR THOUGHTFUL WORK <span>·</span> v1.0</footer>
      </div></div></div>;
}
