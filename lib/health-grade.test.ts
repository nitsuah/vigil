import { describe, it, expect } from 'vitest';
import { healthGrade, buildGradeDist } from './health-grade';
import { getHealthGrade } from './dashboard-utils';

describe('health grade scale', () => {
    it.each([
        [100, 'A+'], [95, 'A+'], [94, 'A'], [90, 'A'], [89, 'B'], [80, 'B'],
        [79, 'C'], [70, 'C'], [69, 'D'], [62, 'D'], [60, 'D'], [59, 'F'], [0, 'F'],
    ])('%i → %s', (score, grade) => {
        expect(healthGrade(score)).toBe(grade);
    });

    it('the dashboard letter always matches the API letter (regression: 62 showed "C" in the UI, "D" in MCP)', () => {
        for (let score = 0; score <= 100; score++) {
            expect(getHealthGrade(score).grade).toBe(healthGrade(score));
        }
    });

    it('distribution has a bucket for every grade', () => {
        expect(buildGradeDist([{ health_score: 96 }, { health_score: 62 }, { health_score: null }])).toEqual({
            'A+': 1, A: 0, B: 0, C: 0, D: 1, F: 1,
        });
    });
});
