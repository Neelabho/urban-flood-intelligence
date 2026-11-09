import { useState } from 'react'
import EChart, { AXIS, PALETTE } from '../components/EChart'
import { CI, Callout, ErrorBox, Loading, PageHeader, Panel, Plain, Section, TechDetails, Timestamp } from '../components/ui'
import { fmt, useStatic } from '../lib/data'
import type { Curves, Score } from '../lib/types'

type Sus = {
  models: Record<string, { spatial_cv: Score; curves: Curves }>
  baselines: Record<string, { train_split_score: Score }>
  xgb_tuning_grid: { max_depth: number; n_estimators: number; pr_auc: number; roc_auc: number }[]
  random_vs_spatial_cv: { random_cv: Score; spatial_cv: Score }
  holdout_test: Record<string, Score>
  holdout_test_curves: Curves
  spatiotemporal: Record<string, Score>
  ablation: Record<string, Score>
  explainability: { shap_global: { feature: string; mean_abs_shap: number }[]; pdp: Record<string, { x: number[]; y: number[] }>; beeswarm: Record<string, { shap: number[]; value_pct: number[] }>; note: string }
  selection: { best_by_spatial_cv_pr_auc: string; final_model: string; xgb_tuned: { max_depth: number; n_estimators: number }; threshold_from_train_oof: number; rationale: string }
  meta: { data_split: Record<string, number | string> }
}
type M = { generated_utc: string; susceptibility: Sus; experiments: { id: string; group: string; date_utc: string; model: string; validation: string; git_commit: string; path: string }[] }

const NAME: Record<string, string> = { logistic_regression: 'Logistic regression', decision_tree: 'Decision tree', random_forest: 'Random forest', xgboost: 'XGBoost', lightgbm: 'LightGBM', svm_rbf: 'SVM (RBF)', torch_mlp: 'MLP (PyTorch)',
  physical_terrain_index: 'Terrain index (HAND/TWI/depressions)', built_fraction_only: 'Built-up fraction only', road_density_only: 'Road density only' }

export default function Research() {
  const m = useStatic<M>('kolkata/models.json')
  const [curveKind, setCurveKind] = useState<'roc' | 'pr'>('pr')
  if (m.error) return <ErrorBox error={m.error} />
  if (!m.data) return <Loading what="experiment results" />
  const S = m.data.susceptibility
  const ds = S.meta.data_split
  const ho = S.holdout_test.xgboost
  const cm = ho.confusion_matrix
  const shap = S.explainability.shap_global.slice(0, 14).reverse()
  const abl = Object.entries(S.ablation)
  return (
    <div>
      <PageHeader eyebrow="Research & models" title="How good is the map?">
        We tested the map the way you would test a student: by hiding some answers and checking whether it could still find them.
        <div className="mt-1"><Timestamp iso={m.data.generated_utc} /></div>
      </PageHeader>
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <Plain title="The test">
            <p>We hid whole neighbourhoods from the map while building it, then asked it to rate them. If you pick one spot that the news reported
              as flooded and one ordinary spot, the map rated the flooded one as riskier <b>about {Math.round(ho.roc_auc * 100)} times out of 100</b>.</p>
            <p className="mt-3">We also built the map only from floods reported up to 2024 and checked it against places that first flooded in 2025 and 2026.
              It still picked the flooded place <b>about {Math.round(S.spatiotemporal.all_later_localities.roc_auc * 100)} times out of 100</b>.</p>
            <p className="mt-3 text-[14px] text-slate">A coin toss would score 50. A perfect map would score 100.</p>
          </Plain>
          <Plain title="What seems to matter most">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Tightly packed buildings and lots of paved roads, as in the old city centre.</li>
              <li>Tall buildings close together, which show up as a very uneven surface in height maps.</li>
              <li>How far a spot is from canals and open drains.</li>
              <li>Trees and green space, which go with less flooding.</li>
            </ul>
            <p className="mt-3 text-[14px] text-slate">These are patterns the map found, not proven causes. Kolkata is very flat, so the height of the land on its own told us little.</p>
          </Plain>
          <Plain title="Where it does badly">
            <p>It underrates newer parts of the city that also flood, such as Sarsuna, Behala and Joka in the south and Salt Lake in the east. Their
              streets look different from the old centre, and their flooding has different causes, such as overflowing canals and drains that were
              never planned when these wards joined the city.</p>
          </Plain>
          <Plain title="What it cannot do">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Say exactly when a street will flood. It shows which places flood more often.</li>
              <li>See areas that flood but never made the news. They may look safer than they are.</li>
              <li>Account for drains and pumps, because that information is not public.</li>
              <li>Be used for other cities. It was built and tested only for Kolkata.</li>
            </ul>
          </Plain>
        </div>
      </Section>

      <TechDetails title="How did we get this? (full results)">
      <Section kicker="Module A · susceptibility" title="Model comparison under spatial cross-validation">
        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Panel title={`Grouped 5-fold CV on 2 km blocks · train split (${ds.n_train_pos} positives / ${ds.n_train} cells)`}>
            <div className="overflow-x-auto">
              <table className="data">
                <thead><tr><th>Model</th><th className="text-right">ROC-AUC [95% CI]</th><th className="text-right">PR-AUC</th><th className="text-right">Lift</th><th className="text-right">Brier</th><th className="text-right">Recall</th><th className="text-right">Precision</th><th className="text-right">Bal. acc.</th></tr></thead>
                <tbody>
                  {Object.entries(S.models).sort((a, b) => b[1].spatial_cv.pr_auc - a[1].spatial_cv.pr_auc).map(([k, v]) => (
                    <tr key={k}><td className={k === S.selection.best_by_spatial_cv_pr_auc ? 'font-semibold' : ''}>{NAME[k] ?? k}</td>
                      <td className="num text-right">{v.spatial_cv.roc_auc.toFixed(3)}<CI ci={v.spatial_cv.ci95_block_bootstrap?.roc_auc} /></td>
                      <td className="num text-right">{v.spatial_cv.pr_auc.toFixed(3)}</td><td className="num text-right">{v.spatial_cv.pr_auc_lift.toFixed(1)}×</td>
                      <td className="num text-right">{v.spatial_cv.brier?.toFixed(4) ?? 'n/a'}</td><td className="num text-right">{v.spatial_cv.recall.toFixed(2)}</td>
                      <td className="num text-right">{v.spatial_cv.precision.toFixed(2)}</td><td className="num text-right">{v.spatial_cv.balanced_accuracy.toFixed(2)}</td></tr>
                  ))}
                  {Object.entries(S.baselines).map(([k, v]) => (
                    <tr key={k} className="text-mute"><td>{NAME[k] ?? k} <span className="text-[10.5px]">(non-learned)</span></td><td className="num text-right">{v.train_split_score.roc_auc.toFixed(3)}</td><td className="num text-right">{v.train_split_score.pr_auc.toFixed(3)}</td><td className="num text-right">{v.train_split_score.pr_auc_lift.toFixed(1)}×</td><td colSpan={4} /></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-slate">Threshold-dependent metrics use the F1-optimal threshold on out-of-fold predictions. {S.selection.rationale} Accuracy is not reported: with ~1% prevalence a constant "no" scores 99%.</p>
          </Panel>
          <Panel title="Out-of-fold curves" note={
            <span className="flex gap-1">{(['pr', 'roc'] as const).map((k) => <button key={k} onClick={() => setCurveKind(k)} className={`border px-1.5 ${curveKind === k ? 'border-ink bg-ink text-paper' : 'border-line'}`}>{k.toUpperCase()}</button>)}</span>}>
            <EChart height={320} option={{
              tooltip: { trigger: 'item' }, legend: { bottom: 0, textStyle: { fontSize: 10 } }, grid: { left: 40, right: 10, top: 10, bottom: 70 },
              xAxis: { type: 'value', min: 0, max: 1, name: curveKind === 'roc' ? 'FPR' : 'Recall', ...AXIS }, yAxis: { type: 'value', min: 0, max: 1, name: curveKind === 'roc' ? 'TPR' : 'Precision', ...AXIS },
              series: Object.entries(S.models).map(([k, v]) => ({ name: NAME[k] ?? k, type: 'line', showSymbol: false,
                data: curveKind === 'roc' ? v.curves.roc.fpr.map((x, i) => [x, v.curves.roc.tpr[i]]) : v.curves.pr.recall.map((x, i) => [x, v.curves.pr.precision[i]]) })),
            }} />
          </Panel>
        </div>
      </Section>

      <Section kicker="Validation" title="Spatial, held-out and spatio-temporal tests">
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Random vs spatial CV (XGBoost)">
            <table className="data"><thead><tr><th /><th className="text-right">ROC-AUC</th><th className="text-right">PR-AUC</th></tr></thead><tbody>
              <tr><td>Random 5-fold</td><td className="num text-right">{S.random_vs_spatial_cv.random_cv.roc_auc.toFixed(3)}</td><td className="num text-right">{S.random_vs_spatial_cv.random_cv.pr_auc.toFixed(3)}</td></tr>
              <tr><td>Spatial blocks</td><td className="num text-right">{S.random_vs_spatial_cv.spatial_cv.roc_auc.toFixed(3)}</td><td className="num text-right">{S.random_vs_spatial_cv.spatial_cv.pr_auc.toFixed(3)}</td></tr>
            </tbody></table>
            <p className="mt-2 text-[12px] text-slate">Random splits let neighbouring cells leak information and overstate PR-AUC by {fmt.pct(S.random_vs_spatial_cv.random_cv.pr_auc / S.random_vs_spatial_cv.spatial_cv.pr_auc - 1, 0)}.</p>
          </Panel>
          <Panel title={`Untouched test blocks (${ho.n_pos} positives / ${ho.n} cells)`}>
            <table className="data"><thead><tr><th>Model</th><th className="text-right">ROC-AUC</th><th className="text-right">PR-AUC</th></tr></thead><tbody>
              {Object.entries(S.holdout_test).map(([k, v]) => <tr key={k}><td>{NAME[k] ?? k}</td><td className="num text-right">{v.roc_auc.toFixed(3)}{k === 'xgboost' && <CI ci={v.ci95_block_bootstrap?.roc_auc} />}</td><td className="num text-right">{v.pr_auc.toFixed(3)}</td></tr>)}
            </tbody></table>
            <div className="mt-3 text-[12px]">
              <div className="eyebrow mb-1">XGBoost confusion matrix (threshold {S.selection.threshold_from_train_oof.toFixed(2)}, frozen from training)</div>
              <div className="grid w-56 grid-cols-[70px_1fr_1fr] text-center text-[11.5px]">
                <div /><div className="text-mute">pred. 0</div><div className="text-mute">pred. 1</div>
                <div className="text-left text-mute">actual 0</div><div className="num border border-line bg-paper py-1.5">{fmt.n(cm[0][0])}</div><div className="num border border-line py-1.5">{cm[0][1]}</div>
                <div className="text-left text-mute">actual 1</div><div className="num border border-line py-1.5">{cm[1][0]}</div><div className="num border border-line bg-[#f6e6cf] py-1.5">{cm[1][1]}</div>
              </div>
              <div className="mt-1 text-[11.5px] text-mute">Recall {ho.recall.toFixed(2)} · precision {ho.precision.toFixed(2)} · specificity {ho.specificity.toFixed(3)}. Wide intervals: only {ho.n_pos} test positives.</div>
            </div>
          </Panel>
          <Panel title="Localities first documented in 2025–2026">
            <table className="data"><tbody>
              {Object.entries(S.spatiotemporal).map(([k, v]) => <tr key={k}><td>{k === 'all_later_localities' ? 'All later localities' : 'Only those > 500 m from earlier ones'} <span className="text-mute">(n+={v.n_pos})</span></td><td className="num text-right">ROC {v.roc_auc.toFixed(3)}</td><td className="num text-right">PR {v.pr_auc.toFixed(3)}</td></tr>)}
            </tbody></table>
            <p className="mt-2 text-[12px] text-slate">Trained on localities documented 2016–2024 plus training-block background; evaluated on new localities against held-out background. Skill persists for new places, though partly because reporting concentrates in the same urban core.</p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Ablation" title="What each feature group contributes">
        <Panel>
          <EChart height={260} option={{
            tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { fontSize: 11 } }, grid: { left: 140, right: 20, top: 28, bottom: 24 },
            yAxis: { type: 'category', data: abl.map(([k]) => k.replace(/_/g, ' ')), ...AXIS }, xAxis: { type: 'value', min: 0, ...AXIS },
            series: [{ name: 'ROC-AUC', type: 'bar', data: abl.map(([, v]) => v.roc_auc), itemStyle: { color: '#0f1b2d' } }, { name: 'PR-AUC', type: 'bar', data: abl.map(([, v]) => v.pr_auc), itemStyle: { color: '#d9762b' } }],
          }} />
          <p className="text-[12px] leading-relaxed text-slate">Removing surface-model "terrain" features hurts most (PR-AUC {S.ablation.all_features.pr_auc.toFixed(3)} → {S.ablation.without_terrain.pr_auc.toFixed(3)}), and terrain alone nearly matches all features. Because GLO-30 is a <b>surface</b> model, slope and elevation variability inside dense neighbourhoods largely measure building form; the non-learned bare-terrain index scores below chance. SAR features add little.</p>
        </Panel>
      </Section>

      <Section kicker="Explainability" title="SHAP and partial dependence (final XGBoost)">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Panel title="Global importance (mean |SHAP|, urban cells)">
            <EChart height={380} option={{
              grid: { left: 170, right: 16, top: 6, bottom: 24 }, tooltip: { trigger: 'axis' },
              yAxis: { type: 'category', data: shap.map((s) => s.feature.replace(/_/g, ' ')), ...AXIS }, xAxis: { type: 'value', ...AXIS },
              series: [{ type: 'bar', data: shap.map((s) => s.mean_abs_shap), itemStyle: { color: '#3d6a8e' } }],
            }} />
            <p className="text-[11.5px] text-mute">{S.explainability.note}</p>
          </Panel>
          <Panel title="Local explanations: SHAP value vs feature percentile (400 sampled urban cells)">
            <EChart height={380} option={{
              tooltip: { trigger: 'item', formatter: (p: { seriesName: string; value: number[] }) => `${p.seriesName}<br/>SHAP ${p.value[0].toFixed(2)} · value pct ${(p.value[2] * 100).toFixed(0)}` },
              grid: { left: 170, right: 40, top: 6, bottom: 30 },
              xAxis: { type: 'value', name: 'SHAP (log-odds)', ...AXIS },
              yAxis: { type: 'category', data: Object.keys(S.explainability.beeswarm).map((f) => f.replace(/_/g, ' ')).reverse(), ...AXIS },
              visualMap: { min: 0, max: 1, dimension: 2, orient: 'vertical', right: 0, top: 'center', itemHeight: 100, text: ['high', 'low'], textStyle: { fontSize: 10 }, inRange: { color: ['#3d6a8e', '#d9d2c3', '#a8322d'] } },
              series: Object.entries(S.explainability.beeswarm).reverse().map(([f, v], k) => ({ name: f, type: 'scatter', symbolSize: 4,
                data: v.shap.map((s, i) => [s, k + (Math.sin(i * 12.9898) * 0.3), v.value_pct[i]]) })),
            }} />
          </Panel>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(S.explainability.pdp).map(([f, v], i) => (
            <Panel key={f} title={`Partial dependence · ${f.replace(/_/g, ' ')}`}>
              <EChart height={160} option={{ grid: { left: 44, right: 10, top: 10, bottom: 28 }, tooltip: { trigger: 'axis' },
                xAxis: { type: 'value', scale: true, ...AXIS }, yAxis: { type: 'value', scale: true, ...AXIS },
                series: [{ type: 'line', showSymbol: false, data: v.x.map((x, j) => [x, v.y[j]]), lineStyle: { color: PALETTE[i % PALETTE.length] } }] }} />
            </Panel>
          ))}
        </div>
      </Section>

      <Section kicker="Calibration" title="Reliability of out-of-fold scores (XGBoost)">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Panel>
            <EChart height={240} option={{ grid: { left: 44, right: 10, top: 10, bottom: 32 }, tooltip: { trigger: 'item' },
              xAxis: { type: 'value', name: 'mean predicted', ...AXIS }, yAxis: { type: 'value', name: 'observed frequency', ...AXIS },
              series: [{ type: 'scatter', data: S.models.xgboost.curves.calibration.map((c) => [c.mean_pred, c.obs_freq, c.n]), symbolSize: 8, itemStyle: { color: '#0f1b2d' } },
                { type: 'line', showSymbol: false, data: [[0, 0], [0.6, 0.6]], lineStyle: { type: 'dashed', color: '#bbb' } }] }} />
          </Panel>
          <Callout>Class weighting inflates raw scores, and case-control sampling means no score is an absolute flood probability (ECE {S.models.xgboost.spatial_cv.ece?.toFixed(3)}, Brier {S.models.xgboost.spatial_cv.brier?.toFixed(4)}). The map therefore shows <b>percentiles</b> and quantile classes, and uncertainty comes from a 30-member block-bootstrap ensemble rather than from the raw score.</Callout>
        </div>
      </Section>

      <Section kicker="Model selection" title="XGBoost tuning grid (spatial CV, train split only)">
        <div className="overflow-x-auto border border-line bg-white">
          <table className="data"><thead><tr><th>max_depth</th><th>n_estimators</th><th className="text-right">ROC-AUC</th><th className="text-right">PR-AUC</th></tr></thead>
            <tbody>{S.xgb_tuning_grid.map((g, i) => <tr key={i} className={g.max_depth === S.selection.xgb_tuned.max_depth && g.n_estimators === S.selection.xgb_tuned.n_estimators ? 'font-semibold' : ''}><td>{g.max_depth}</td><td>{g.n_estimators}</td><td className="num text-right">{g.roc_auc.toFixed(3)}</td><td className="num text-right">{g.pr_auc.toFixed(3)}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section kicker="Limitations" title="What these results do not show">
        <div className="prose-ufii max-w-4xl text-[13.5px] text-slate">
          <ul>
            <li><b>Reporting bias.</b> Positives come from news reports that favour central, arterial and newsworthy places. Target-group background sampling (urban cells only) reduces but cannot remove this; part of the skill may reflect where journalists report.</li>
            <li><b>Positional uncertainty.</b> Localities are geocoded to points (median uncertainty ~100 m, up to 2 km for neighbourhoods); a 500 m buffer around positives is excluded from background.</li>
            <li><b>Surface model, not terrain.</b> Without a building-removed DEM, "terrain" features conflate topography and urban form. Feature importance is not causal.</li>
            <li><b>No drainage network.</b> Kolkata's underground storm-drain and pumping data are not public; drainage capacity, a first-order control, is absent from the model.</li>
            <li><b>Small samples.</b> 75 positive cells and 24 event days. Confidence intervals are wide; differences between top models are not significant.</li>
            <li><b>No cross-city claim.</b> Nothing here has been tested outside Kolkata.</li>
          </ul>
        </div>
      </Section>

      <Section kicker="Reproducibility" title={`Experiment registry (${m.data.experiments.length} records)`}>
        <div className="max-h-[360px] overflow-y-auto border border-line bg-white">
          <table className="data"><thead><tr><th>Experiment</th><th>Group</th><th>Model</th><th>Validation</th><th>Commit</th></tr></thead>
            <tbody>{m.data.experiments.map((e) => <tr key={e.id}><td className="num text-[11.5px]">{e.id}</td><td>{e.group}</td><td>{e.model}</td><td className="text-[11.5px] text-slate">{e.validation}</td><td className="num text-[11px]">{e.git_commit}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>
      </TechDetails>
    </div>
  )
}
