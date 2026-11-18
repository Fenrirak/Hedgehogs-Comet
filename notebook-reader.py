import io, json, re
from pyOneNote.OneDocument import OneDocment

def read_section(data):
    stream = io.BytesIO(bytes(data))
    document = OneDocment(stream)
    # Preserve the last stored text for each object identity. Historical revisions
    # can still remain in a notebook: the student reviews recovered text before use.
    objects = {}
    nodes = []
    OneDocment.traverse_nodes(document.root_file_node_list, nodes, ['ObjectDeclaration2RefCountFND'])
    def collect(properties):
        result = []
        for prid, data in zip(properties.rgPrids, properties.rgData):
            if str(prid) == 'RichEditTextUnicode' and hasattr(data, 'Data'):
                result.append(data.Data.decode('utf-16-le', errors='strict').replace('\x00', '').strip())
            elif hasattr(data, 'rgPrids'):
                result.extend(collect(data))
            elif isinstance(data, list):
                for child in data:
                    if hasattr(child, 'rgPrids'):
                        result.extend(collect(child))
        return result
    for item in nodes:
        if hasattr(item, 'propertySet'):
            value = '\n'.join(collect(item.propertySet.body))
            if value.strip():
                objects[str(item.data.body.oid)] = value
    lines = list(objects.values())
    text = '\n'.join(lines)
    if len(text) > 200000:
        raise ValueError('Section exceeds 200,000 characters. Export a smaller section.')
    return text
