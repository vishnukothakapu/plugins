import { Icon } from '@iconify/react';
import { DateLabel, Link, SectionBox, SimpleTable, StatusLabel } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Typography,
} from '@mui/material';
import React, { useState } from 'react';
import type { ReadinessConditionEvaluation, RuleEvaluation } from '../../resources';
import { getRuleDurationInfo, nrcRouteNames } from '../../utils';

export interface EvaluationRuleTableProps {
  /** Array of rule evaluation records for this node. */
  rules?: RuleEvaluation[];
}

/**
 * Renders an expandable list of rules evaluated for this node conforming to Design Doc §5.5:
 * Each rule has a top-level summary row (Rule Name + Visit CTA, Enforcement Mode, Status, Taint presence, Conditions ratio),
 * and an expandable inspection drawer detailing diagnostics, unblock/blocked durations, lifecycle timestamps,
 * and a nested condition-by-condition evaluation breakdown table.
 */
export default function EvaluationRuleTable({ rules = [] }: EvaluationRuleTableProps) {
  const [expandedRule, setExpandedRule] = useState<string | false>(
    rules.length > 0 ? rules[0].ruleName : false
  );

  const handleAccordionChange =
    (ruleName: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
      setExpandedRule(isExpanded ? ruleName : false);
    };

  if (rules.length === 0) {
    return (
      <SectionBox title="Rule Evaluations">
        <Typography variant="body2" color="text.secondary">
          No rules evaluated for this node yet.
        </Typography>
      </SectionBox>
    );
  }

  return (
    <SectionBox title="Rule Evaluations">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {rules.map((r: RuleEvaluation) => {
          const isSatisfied = r.ruleStatus === 'Satisfied' || r.status === 'Satisfied';
          const isPresent = r.taintStatus === 'Present';
          const taintDesc = r.taintKey
            ? `${r.taintKey}:${r.taintEffect || 'NoSchedule'}`
            : undefined;

          const conditions = r.readinessConditions || [];
          const satisfiedConditions = conditions.filter(
            c => c.currentStatus === c.requiredStatus
          ).length;
          const conditionsRatio = `${satisfiedConditions}/${conditions.length}`;
          const isAllConditionsSatisfied =
            conditions.length > 0 && satisfiedConditions === conditions.length;
          const durationInfo = getRuleDurationInfo(r);

          return (
            <Accordion
              key={r.ruleName}
              expanded={expandedRule === r.ruleName}
              onChange={handleAccordionChange(r.ruleName)}
              disableGutters
              variant="outlined"
              sx={{
                borderRadius: 1,
                '&:before': { display: 'none' },
                overflow: 'hidden',
              }}
            >
              <AccordionSummary
                expandIcon={<Icon icon="mdi:chevron-down" width="20" />}
                aria-controls={`rule-eval-${r.ruleName}-content`}
                id={`rule-eval-${r.ruleName}-header`}
                sx={{
                  bgcolor: 'background.default',
                  px: 2,
                  py: 1,
                  '& .MuiAccordionSummary-content': {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 2,
                    m: 0,
                  },
                }}
              >
                {/* Column 1: Rule Name & Visit Rule Link */}
                <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {r.ruleName}
                  </Typography>
                  <Link
                    routeName={nrcRouteNames.ruleDetail}
                    params={{ name: r.ruleName }}
                    aria-label={`Visit rule ${r.ruleName}`}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: 'primary.main', textDecoration: 'underline' }}
                    >
                      Visit rule
                    </Typography>
                  </Link>
                </Box>

                {/* Column 2: Enforcement Mode */}
                <Box sx={{ minWidth: '110px' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Enforcement
                  </Typography>
                  <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                    {r.enforcementMode || 'continuous'}
                  </Typography>
                </Box>

                {/* Column 3: Status */}
                <Box sx={{ minWidth: '90px' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Status
                  </Typography>
                  <StatusLabel status={isSatisfied ? 'success' : 'warning'}>
                    {r.ruleStatus || (isSatisfied ? 'Satisfied' : 'Unsatisfied')}
                  </StatusLabel>
                </Box>

                {/* Column 4: Taint */}
                <Box sx={{ minWidth: '130px' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Taint
                  </Typography>
                  {isPresent ? (
                    <Chip
                      label={taintDesc || 'Taint Present'}
                      size="small"
                      color="warning"
                      variant="outlined"
                      tabIndex={0}
                      aria-label={`Active taint: ${taintDesc || 'Present'}`}
                      sx={{ fontWeight: 500 }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </Box>

                {/* Column 5: Conditions Satisfaction Ratio */}
                <Box sx={{ minWidth: '120px' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Conditions
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <StatusLabel status={isAllConditionsSatisfied ? 'success' : 'warning'}>
                      {conditionsRatio}
                    </StatusLabel>
                    {r.conditionPolicy === 'anyOf' && (
                      <Typography variant="caption" color="text.secondary">
                        [anyOf]
                      </Typography>
                    )}
                  </Box>
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ p: 2, bgcolor: 'background.paper' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Diagnostics & Duration Metrics */}
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 3,
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: 'background.default',
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    {durationInfo && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {durationInfo.label}
                        </Typography>
                        <Chip
                          label={durationInfo.text}
                          size="small"
                          color={isSatisfied ? 'success' : 'warning'}
                          sx={{ fontWeight: 'bold' }}
                        />
                      </Box>
                    )}

                    {r.reason && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Reason:
                        </Typography>
                        <Typography variant="body2">{r.reason}</Typography>
                      </Box>
                    )}

                    {r.message && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Message:
                        </Typography>
                        <Typography variant="body2">{r.message}</Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Lifecycle Timestamps Grid */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      Lifecycle Timestamps
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          First Evaluated At:
                        </Typography>
                        {r.firstEvaluatedAt ? <DateLabel date={r.firstEvaluatedAt} /> : '—'}
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Last Evaluated At:
                        </Typography>
                        {r.lastEvaluatedAt ? <DateLabel date={r.lastEvaluatedAt} /> : '—'}
                      </Box>
                      {r.taintObservedAt && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Taint Observed At:
                          </Typography>
                          <DateLabel date={r.taintObservedAt} />
                        </Box>
                      )}
                      {r.taintAddedAt && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Taint Added At:
                          </Typography>
                          <DateLabel date={r.taintAddedAt} />
                        </Box>
                      )}
                      {r.taintRemovedAt && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            Taint Removed At:
                          </Typography>
                          <DateLabel date={r.taintRemovedAt} />
                        </Box>
                      )}
                    </Box>
                  </Box>

                  <Divider />

                  {/* Nested Per-Condition Evaluation Table */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="subtitle2" component="h4" sx={{ fontWeight: 600 }}>
                      Readiness Conditions Breakdown ({conditions.length})
                    </Typography>

                    <SimpleTable
                      columns={[
                        {
                          label: 'Condition Type',
                          getter: (c: ReadinessConditionEvaluation) => (
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {c.type}
                            </Typography>
                          ),
                        },
                        {
                          label: 'Satisfied',
                          getter: (c: ReadinessConditionEvaluation) => {
                            const satisfied = c.currentStatus === c.requiredStatus;
                            return (
                              <StatusLabel status={satisfied ? 'success' : 'error'}>
                                {satisfied ? 'Satisfied' : 'Unsatisfied'}
                              </StatusLabel>
                            );
                          },
                        },
                        {
                          label: 'Current Status',
                          getter: (c: ReadinessConditionEvaluation) => {
                            const severity =
                              c.currentStatus === 'True'
                                ? 'success'
                                : c.currentStatus === 'False'
                                ? 'error'
                                : 'warning';
                            return <StatusLabel status={severity}>{c.currentStatus}</StatusLabel>;
                          },
                        },
                        {
                          label: 'Required Status',
                          getter: (c: ReadinessConditionEvaluation) => (
                            <Typography variant="body2">{c.requiredStatus}</Typography>
                          ),
                        },
                        {
                          label: 'Default Status',
                          getter: (c: ReadinessConditionEvaluation) => (
                            <Typography variant="body2" color="text.secondary">
                              {c.defaultStatus || 'Unknown (implicit)'}
                            </Typography>
                          ),
                        },
                      ]}
                      data={conditions}
                      emptyMessage="No conditions defined for this rule."
                    />
                  </Box>
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    </SectionBox>
  );
}
