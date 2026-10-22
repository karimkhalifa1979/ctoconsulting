// Public survey response page (ADK-007, MEA-001): respondents need no account. Anonymous by default,
// with the collection notice shown before any answer is given (PRV-02).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../state/app.jsx';
import { ErrorBox, Spinner } from '../ui/core.jsx';
import { ADKAR_SCORE_SCALE } from '../../shared/refdata.js';
import { fmtDate } from '../lib/format.js';

export default function PublicSurvey() {
  const { token } = useParams();
  const { api } = useApp();
  const [survey, setSurvey] = useState(null);
  const [error, setError] = useState(null);
  const [groupId, setGroupId] = useState('');
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.publicSurvey(token).then((s) => { setSurvey(s); if (s.groups?.length === 1) setGroupId(s.groups[0].id); }).catch(setError); }, [api, token]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.submitSurvey(token, { groupId: groupId || null, answers });
      setDone(true);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="public-page">
      <div className="public-card">
        {!survey && !error && <Spinner />}
        {error && !survey && <ErrorBox error={error} />}
        {survey && (
          <div className="card card-pad">
            <div className="eyebrow">{survey.organisation}</div>
            <h1>{survey.title}</h1>
            <p className="muted">{survey.initiative}{survey.closesAt ? ` · closes ${fmtDate(survey.closesAt)}` : ''}</p>
            {done ? (
              <div className="callout good mt-4"><h4>Thank you</h4>Your response has been recorded{survey.anonymous ? ' anonymously' : ''}. You can close this page.</div>
            ) : (
              <form onSubmit={submit} className="mt-3">
                {survey.notice && <div className="callout small mb-3"><strong>How your information is used. </strong>{survey.notice}</div>}
                {survey.intro && <p>{survey.intro}</p>}
                {survey.groups?.length > 1 && (
                  <label className="field mb-3"><span>Which group are you part of?<em className="req">*</em></span>
                    <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                      <option value="">Choose…</option>
                      {survey.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </label>
                )}
                {survey.questions.map((q, i) => (
                  q.type === 'text' ? (
                    <label key={q.id} className="field scale-q"><span>{i + 1}. {q.text}</span><textarea rows={3} value={answers[q.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="Optional. Please do not include names or personal details." /></label>
                  ) : (
                    <fieldset key={q.id} className="scale-q" style={{ border: '1px solid var(--line)' }}>
                      <legend className="strong" style={{ padding: '0 4px' }}>{i + 1}. {q.text}</legend>
                      <div className="scale-opts">
                        {ADKAR_SCORE_SCALE.map((o) => (
                          <label key={o.value}><input type="radio" name={q.id} value={o.value} checked={Number(answers[q.id]) === o.value} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.value }))} /><b>{o.value}</b><span>{o.label}</span></label>
                        ))}
                      </div>
                    </fieldset>
                  )
                ))}
                {error && <ErrorBox error={error} />}
                <div className="btn-row mt-3"><button type="submit" className="btn btn-primary" disabled={busy || (survey.groups?.length > 1 && !groupId)}>{busy ? 'Submitting…' : 'Submit my response'}</button></div>
                <p className="tiny muted mt-2">Results are reported only for groups of five or more people{survey.anonymous ? ', and your name is not recorded' : ''}.</p>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
