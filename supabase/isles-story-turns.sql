-- Run this in the Supabase project already used by Studio Board and mushroomsSveta.
-- The Studio Board story editor can read and edit rows without signing in.

create table if not exists public.isles_story_turns (
  event_id text primary key check (char_length(event_id) between 1 and 80),
  sort_order integer not null default 0,
  route_id text not null check (route_id in (
    'lagoon', 'reef', 'mangrove', 'observatory', 'tempest',
    'moon-atoll', 'whale-graveyard', 'lighthouse'
  )),
  route_visit integer not null default 1 check (route_visit between 1 and 99),
  title text not null check (char_length(title) between 1 and 160),
  narrative text not null default '',
  choice_a_label text not null default 'Выбрать первый путь',
  choice_a_effect text not null default '',
  choice_a_wood integer not null default 0 check (choice_a_wood between -99 and 99),
  choice_a_stone integer not null default 0 check (choice_a_stone between -99 and 99),
  choice_a_berries integer not null default 0 check (choice_a_berries between -99 and 99),
  choice_a_shells integer not null default 0 check (choice_a_shells between -99 and 99),
  choice_b_label text not null default 'Выбрать второй путь',
  choice_b_effect text not null default '',
  choice_b_wood integer not null default 0 check (choice_b_wood between -99 and 99),
  choice_b_stone integer not null default 0 check (choice_b_stone between -99 and 99),
  choice_b_berries integer not null default 0 check (choice_b_berries between -99 and 99),
  choice_b_shells integer not null default 0 check (choice_b_shells between -99 and 99),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (route_id, route_visit)
);

create index if not exists isles_story_turns_enabled_order_idx
  on public.isles_story_turns (enabled, sort_order, route_visit);

alter table public.isles_story_turns enable row level security;
revoke all on public.isles_story_turns from public, anon, authenticated;
grant select on public.isles_story_turns to anon, authenticated;
grant insert, update, delete on public.isles_story_turns to anon, authenticated;

drop policy if exists "Public can read enabled Isles story turns" on public.isles_story_turns;
create policy "Public can read enabled Isles story turns"
  on public.isles_story_turns for select to anon, authenticated
  using (enabled);

drop policy if exists "Owner can manage Isles story turns" on public.isles_story_turns;
drop policy if exists "Anyone can manage Isles story turns" on public.isles_story_turns;
create policy "Anyone can manage Isles story turns"
  on public.isles_story_turns for all to anon, authenticated
  using (true)
  with check (true);

insert into public.isles_story_turns (
  event_id, sort_order, route_id, route_visit, title, narrative,
  choice_a_label, choice_a_effect, choice_a_wood, choice_a_stone, choice_a_berries, choice_a_shells,
  choice_b_label, choice_b_effect, choice_b_wood, choice_b_stone, choice_b_berries, choice_b_shells, enabled
) values
  ('lagoon-buoy', 10, 'lagoon', 1, 'Буёк зовёт по имени', 'На старом буе сам собой включается фонарь. Из динамика звучит голос смотрителя, хотя запись датирована завтрашним днём. Он просит не зажигать маяк.', 'Починить буёк', 'Починка даёт полезные материалы, но голос обрывается на предупреждении.', 0, 0, 0, 2, 'Записать сигнал', 'Вы сохраняете сигнал и забираете оставленные у буя припасы.', 1, 1, 1, 0, true),
  ('reef-second-shore', 20, 'reef', 1, 'Вторая береговая линия', 'За коралловой стеной обнаруживается берег, которого нет ни на одной карте. На камне вырезан контур вашего лагеря.', 'Снять мерки', 'Точные заметки помогут команде подготовить следующую экспедицию.', 1, 2, 0, 1, 'Искать следы', 'Следы ведут к спрятанной корзине с припасами.', 2, 0, 2, 0, true),
  ('mangrove-reverse-map', 30, 'mangrove', 1, 'Карта на обратной стороне', 'В бутылке лежит карта архипелага, нарисованная задом наперёд. Если перевернуть её на свет, появляется остров, которого ещё нет на горизонте.', 'Сохранить карту', 'На полях отмечен тайник старого картографа.', 0, 2, 1, 2, 'Сверить с течением', 'Вы находите безопасный проход среди корней.', 2, 1, 2, 0, true),
  ('mangrove-backward-tide', 40, 'mangrove', 2, 'Прилив идёт вспять', 'Вода отступает к истоку. В грязи остаётся свежий след сапога, ведущий прямо к вашей лодке.', 'Идти по следу', 'У следа найдены оставленные экспедицией инструменты.', 2, 2, 0, 1, 'Отметить течение', 'Наблюдения помогают выбрать короткий путь обратно.', 1, 0, 2, 2, true),
  ('observatory-tomorrow-chart', 50, 'observatory', 1, 'Звёздная карта на завтра', 'В обсерватории лежит карта ночного неба. На ней уже нанесены созвездия следующей ночи — и крошечная точка на месте вашего лагеря.', 'Забрать линзу', 'Линза пригодится для чтения дальних карт.', 0, 3, 1, 2, 'Скопировать небо', 'Скопированная схема указывает на спокойную воду.', 2, 1, 2, 0, true),
  ('tempest-fresh-log', 60, 'tempest', 1, 'Бортовой журнал ещё мокрый', 'В разбитой лодке лежит журнал с сегодняшней датой. Последняя запись сделана почерком смотрителя: «Маяк отвечает изнутри».', 'Спасти журнал', 'Масляный футляр уцелел вместе с запасами.', 2, 1, 0, 2, 'Подать сигнал', 'Ответ приходит с пустого берега и приносит полезный груз.', 1, 2, 2, 0, true),
  ('moon-atoll-reversed-reflection', 70, 'moon-atoll', 1, 'Отражение идёт другим курсом', 'Лунная дорожка в воде поворачивает к суше. В ту же секунду компас показывает не на север, а на маяк.', 'Плыть за отражением', 'За отмелью обнаруживаются ракушки и ягоды.', 1, 0, 2, 3, 'Довериться компасу', 'Под скалой скрыта ниша с инструментами.', 2, 3, 0, 1, true),
  ('whale-graveyard-song', 80, 'whale-graveyard', 1, 'Песня без голоса', 'Кости в бухте вибрируют, когда поднимается прилив. На гладкой поверхности одной из них проступает имя смотрителя — и дата, которой ещё не было.', 'Следовать за эхом', 'Эхо приводит к спрятанным запасам экспедиции.', 1, 3, 1, 2, 'Собрать обломки', 'В обломках найдено всё нужное для последнего перехода.', 3, 1, 2, 0, true),
  ('lighthouse-keeper-echo', 90, 'lighthouse', 1, 'Смотритель отвечает', 'Внутри маяка никого нет. Но лампа загорается, и из неё звучит ваш собственный голос: «Я уже был здесь. Не позволяй островам исчезнуть».', 'Открыть линзу', 'Свет возвращается на архипелаг, а карта остаётся открытой для новых рейсов.', 3, 3, 2, 3, 'Погасить маяк', 'Вы сохраняете тайну приливов и забираете оставленные смотрителем припасы.', 4, 2, 3, 1, true),
  ('lagoon-wreck-mark', 15, 'lagoon', 2, 'Знак на старом корпусе', 'На обшивке затонувшей лодки вы находите свежую метку лагеря. За доской спрятана записка: «Не верьте берегу, который увидите после третьего прилива».', 'Забрать доски', 'Вы разбираете корпус и находите инструменты.', 3, 1, 0, 0, 'Сохранить записку', 'Капитан оставил корзину с припасами.', 0, 0, 3, 2, true),
  ('reef-glass-garden', 25, 'reef', 2, 'Сад из морского стекла', 'На мелководье мерцают стеклянные кораллы. Они повторяют очертания маяка, хотя он должен быть далеко за горизонтом.', 'Собрать фрагменты', 'Осколки укрепят мастерскую.', 0, 3, 0, 2, 'Искать безопасный путь', 'В тихой заводи остались ягоды и ракушки.', 1, 0, 3, 1, true),
  ('observatory-empty-constellation', 55, 'observatory', 2, 'Созвездие без звёзд', 'Вторая карта показывает пустой участок неба. На линзе проступают силуэты команды у ещё не построенного маяка.', 'Запечатать линзу', 'Для футляра нужны ракушки, зато линза переживёт дальний переход.', 0, 2, 0, -1, 'Сверить по звёздам', 'Точные расчёты приносят камень и припасы.', 1, 2, 2, 0, true),
  ('tempest-clemency', 65, 'tempest', 2, 'Штиль внутри шторма', 'В центре пролива вода становится гладкой. Из тумана выходит лодка смотрителя; на борту лежат инструменты, но весло одно.', 'Плыть к лодке', 'Путь опасен: понадобится камень для ремонта борта.', 3, -1, 0, 2, 'Переждать прилив', 'Вы экономите силы и подбираете припасы.', 1, 1, 2, 0, true),
  ('moon-atoll-tidal-clock', 75, 'moon-atoll', 2, 'Часы, которые считают приливы', 'В скале найдено устройство с двумя циферблатами. Один показывает время лагеря, второй отстаёт ровно на один день.', 'Завести механизм', 'Детали пригодятся для маяка, но придётся потратить дерево.', -1, 3, 0, 2, 'Оставить часы', 'Под циферблатом спрятана корзина с припасами.', 1, 0, 3, 1, true),
  ('whale-graveyard-beacon', 85, 'whale-graveyard', 2, 'Маяк под водой', 'Во время отлива на костяном рифе открывается каменная дверь. За ней горит свет — точно такой же, как у лагерного фонаря.', 'Открыть дверь', 'Камень поможет освободить заклинивший проход.', 1, -1, 1, 3, 'Оставить метку', 'За дверью находится запас для последнего рейса.', 2, 2, 2, 0, true),
  ('lighthouse-second-light', 95, 'lighthouse', 2, 'Второй свет на горизонте', 'На рассвете зажигается ещё один маяк — далеко за пределами карты. На столе смотрителя лежит чистый лист и ключ от новой лодки.', 'Снарядить новую лодку', 'Материалы уходят на корпус, зато впереди открывается новый путь.', -2, -1, 2, 2, 'Сохранить лагерь', 'Смотритель оставил запасы для долгой жизни на архипелаге.', 3, 3, 3, 3, true)
on conflict (event_id) do nothing;
