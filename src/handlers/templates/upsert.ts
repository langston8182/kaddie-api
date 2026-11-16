import { templateToDto } from '../../mappers';
import { TemplateModel } from '../../models/template.model';
import { api, ok, requireId } from '../../utils/handler';
import { success } from '../../utils/response';
import { HttpError } from '../../utils/validation';
import { validateTemplate } from '../../validators/shopping.validators';

const MAX_TEMPLATES = 50;

/** Crée ou remplace un modèle (identifiant fourni par le client, rejouable). */
export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  const data = validateTemplate(ctx.body);

  const existing = await TemplateModel.findOne({ userId: ctx.userId, id });
  if (existing) {
    existing.set({ name: data.name, items: data.items });
    await existing.save();
    return ok(templateToDto(existing.toObject()));
  }
  if ((await TemplateModel.countDocuments({ userId: ctx.userId })) >= MAX_TEMPLATES) {
    throw new HttpError(409, `Maximum ${MAX_TEMPLATES} modèles`);
  }
  const created = await TemplateModel.create({ userId: ctx.userId, id, name: data.name, items: data.items });
  return success(201, templateToDto(created.toObject()));
});
