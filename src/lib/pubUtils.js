import { PUB_TYPES } from './constants';

export const typeIcon  = t => PUB_TYPES.find(p=>p.id===t)?.icon  || '📄';
export const typeLabel = t => PUB_TYPES.find(p=>p.id===t)?.label || 'Publication';
