import { TemplateModel } from '../../models/template.model';
import { api, requireId } from '../../utils/handler';
import { error, noContent } from '../../utils/response';

export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  const template = await TemplateModel.findOneAndDelete({ userId: ctx.userId, id });
  if (!template) return error(404, 'Modèle non trouvé');
  return noContent();
});
