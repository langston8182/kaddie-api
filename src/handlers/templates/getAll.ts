import { templateToDto } from '../../mappers';
import { TemplateModel } from '../../models/template.model';
import { api, ok } from '../../utils/handler';

export const handler = api(async ({ userId }) => {
  const templates = await TemplateModel.find({ userId }).sort({ name: 1 }).lean();
  return ok(templates.map(templateToDto));
});
